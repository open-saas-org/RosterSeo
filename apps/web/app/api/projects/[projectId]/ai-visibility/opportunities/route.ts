import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { aiVisibilityOpportunityReports, aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@rosterseo/db";
import {
  calculateVisibilityScore,
  classifyUrl,
  generateOpportunitiesReport,
  getModelDisplayLabel,
  isBrandedPrompt,
  type CitationCategory,
  type EnrichedOpportunitiesReport,
  type OpportunityDifficulty,
  type OpportunityDigest,
  type OpportunityDigestPrompt,
  type OpportunitiesReport,
} from "@rosterseo/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET  /api/projects/:projectId/ai-visibility/opportunities - the latest
// cached LLM-generated "what to do next" report (or null if none generated
// yet).
// POST /api/projects/:projectId/ai-visibility/opportunities - regenerates:
// builds a deterministic digest of real per-prompt brand-vs-competitor
// standing, citation-source mix, and "locked-in" difficulty from
// aiVisibilityResults, feeds it through ONE structured LLM completion (no
// web search - the digest already carries every real fact), resolves the
// result's related prompts + citations against real data, and caches it as
// a new aiVisibilityOpportunityReports row. Manual regeneration only (a
// "Regenerate" button) - no automatic background staleness job.

type RouteParams = { projectId: string };

const TOP_PROMPTS = 30;
const DAY_MS = 86_400_000;

type CitationRecord = { url: string; title?: string; domain: string; category: CitationCategory; count: number };

function normalizeRawCitation(raw: unknown): { url: string; title?: string; domain: string } | null {
  if (typeof raw === "string") {
    try {
      return { url: raw, domain: new URL(raw).hostname.replace(/^www\./, "") };
    } catch {
      return null;
    }
  }
  const c = raw as { url?: string; title?: string; domain?: string };
  if (!c?.url || !c?.domain) return null;
  return { url: c.url, title: c.title, domain: c.domain };
}

function topN(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([domain]) => domain);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / union.size;
}

// How much the set of cited domains churns day to day - low churn means the
// same sources keep winning ("locked-in"), high churn means no source
// dominates yet ("wide-open"). Fewer than 2 days of signal defaults to
// "wide-open" rather than claiming lock-in we can't support.
function computeDifficulty(dailyDomains: Map<string, Set<string>>): OpportunityDifficulty {
  const days = [...dailyDomains.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([, set]) => set.size > 0);
  if (days.length < 2) return "wide-open";
  let sum = 0;
  for (let i = 1; i < days.length; i++) sum += jaccard(days[i - 1]![1], days[i]![1]);
  const stability = (sum / (days.length - 1)) * 100;
  if (stability < 40) return "wide-open";
  if (stability < 70) return "contested";
  return "locked-in";
}

async function buildDigest(
  tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  projectId: string,
  brandDomain: string,
  brandName: string,
): Promise<{ digest: OpportunityDigest; promptIdByText: Map<string, string>; citationsByPromptId: Map<string, CitationRecord[]> } | null> {
  const [promptRows, competitors] = await Promise.all([
    tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, projectId)),
    tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, projectId)),
  ]);
  if (promptRows.length === 0) return null;

  // Flattened with each competitor's additionalDomains (Settings >
  // Competitors) so classifyUrl below still tags a citation on e.g. a
  // competitor's regional site as "competitor" - see
  // citation-classification.ts's classifyUrl doc comment.
  const competitorDomains = competitors.flatMap((c) => [c.domain, ...(c.additionalDomains ?? [])]);
  const promptIds = promptRows.map((p) => p.id);
  const results = await tx.select().from(aiVisibilityResults).where(inArray(aiVisibilityResults.promptId, promptIds));

  const now = Date.now();
  const cutoff30 = now - 30 * DAY_MS;
  const cutoff7 = now - 7 * DAY_MS;

  type PromptAgg = {
    brand30: boolean[];
    brand7: boolean[];
    competitor30: Map<string, boolean[]>;
    competitor7: Map<string, boolean[]>;
    dailyDomains: Map<string, Set<string>>;
    citedDomainCounts: Map<string, number>;
    citationRecords: Map<string, CitationRecord>;
  };
  const byPrompt = new Map<string, PromptAgg>();
  const platformAgg = new Map<string, { mentioned: number; total: number }>();
  const landscapeCounts = { brand: 0, competitor: 0, community: 0, other: 0 };
  const thirdPartyCounts = new Map<string, number>();
  const communityCounts = new Map<string, number>();
  const competitorOwnedCounts = new Map<string, number>();
  let overallMentioned = 0;
  let overallTotal = 0;

  for (const row of results) {
    const t = row.runAt.getTime();
    if (t < cutoff30) continue;

    const agg: PromptAgg = byPrompt.get(row.promptId) ?? {
      brand30: [],
      brand7: [],
      competitor30: new Map(),
      competitor7: new Map(),
      dailyDomains: new Map(),
      citedDomainCounts: new Map(),
      citationRecords: new Map(),
    };
    byPrompt.set(row.promptId, agg);

    if (row.entityDomain === null) {
      agg.brand30.push(row.mentioned);
      if (t >= cutoff7) agg.brand7.push(row.mentioned);
      overallTotal++;
      if (row.mentioned) overallMentioned++;

      const platform = getModelDisplayLabel(row.provider, row.model);
      const pe = platformAgg.get(platform) ?? { mentioned: 0, total: 0 };
      pe.total++;
      if (row.mentioned) pe.mentioned++;
      platformAgg.set(platform, pe);

      // Only the brand row's citations are counted - competitor rows from
      // the same (prompt, provider, sample) call carry the exact same
      // citations[] array, so including them would multiply-count every
      // real citation by (1 + tracked competitor count).
      if (row.citations) {
        const date = row.runAt.toISOString().slice(0, 10);
        const domainSet = agg.dailyDomains.get(date) ?? new Set<string>();
        for (const raw of row.citations) {
          const citation = normalizeRawCitation(raw);
          if (!citation) continue;
          const { category } = classifyUrl(citation.url, citation.domain, citation.title, [brandDomain], competitorDomains);
          domainSet.add(citation.domain);

          const bucket = category === "brand" ? "brand" : category === "competitor" ? "competitor" : category === "social" ? "community" : "other";
          landscapeCounts[bucket]++;
          if (bucket === "other") thirdPartyCounts.set(citation.domain, (thirdPartyCounts.get(citation.domain) ?? 0) + 1);
          if (bucket === "community") communityCounts.set(citation.domain, (communityCounts.get(citation.domain) ?? 0) + 1);
          if (category === "competitor") competitorOwnedCounts.set(citation.domain, (competitorOwnedCounts.get(citation.domain) ?? 0) + 1);
          if (category !== "brand") agg.citedDomainCounts.set(citation.domain, (agg.citedDomainCounts.get(citation.domain) ?? 0) + 1);

          const rec = agg.citationRecords.get(citation.url) ?? { url: citation.url, title: citation.title, domain: citation.domain, category, count: 0 };
          rec.count++;
          if (!rec.title && citation.title) rec.title = citation.title;
          agg.citationRecords.set(citation.url, rec);
        }
        agg.dailyDomains.set(date, domainSet);
      }
    } else {
      const list30 = agg.competitor30.get(row.entityDomain) ?? [];
      list30.push(row.mentioned);
      agg.competitor30.set(row.entityDomain, list30);
      if (t >= cutoff7) {
        const list7 = agg.competitor7.get(row.entityDomain) ?? [];
        list7.push(row.mentioned);
        agg.competitor7.set(row.entityDomain, list7);
      }
    }
  }

  const digestPrompts: OpportunityDigestPrompt[] = [];
  const citationsByPromptId = new Map<string, CitationRecord[]>();
  const promptIdByText = new Map<string, string>();

  for (const prompt of promptRows) {
    promptIdByText.set(prompt.promptText, prompt.id);
    const agg = byPrompt.get(prompt.id);

    const brandRate = agg && agg.brand30.length > 0 ? calculateVisibilityScore(agg.brand30.map((m) => ({ mentioned: m }))) : null;
    const brandRate7d = agg && agg.brand7.length > 0 ? calculateVisibilityScore(agg.brand7.map((m) => ({ mentioned: m }))) : null;

    let topCompetitor: OpportunityDigestPrompt["topCompetitor"] = null;
    if (agg) {
      let bestDomain: string | null = null;
      let bestRate = -1;
      for (const [domain, list] of agg.competitor30) {
        const rate = calculateVisibilityScore(list.map((m) => ({ mentioned: m })));
        if (rate > bestRate) {
          bestRate = rate;
          bestDomain = domain;
        }
      }
      if (bestDomain) {
        const list7 = agg.competitor7.get(bestDomain);
        topCompetitor = { domain: bestDomain, rate: bestRate, rate7d: list7 && list7.length > 0 ? calculateVisibilityScore(list7.map((m) => ({ mentioned: m }))) : null };
      }
    }

    digestPrompts.push({
      promptText: prompt.promptText,
      tags: prompt.tags ?? [],
      branded: isBrandedPrompt(prompt.promptText, brandName, brandDomain),
      brandRate,
      brandRate7d,
      topCompetitor,
      difficulty: computeDifficulty(agg?.dailyDomains ?? new Map()),
      citedDomains: agg
        ? [...agg.citedDomainCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([d]) => d)
        : [],
    });

    if (agg) citationsByPromptId.set(prompt.id, [...agg.citationRecords.values()]);
  }

  const sortedPrompts = [...digestPrompts]
    .sort((a, b) => {
      const gapA = a.topCompetitor ? a.topCompetitor.rate - (a.brandRate ?? 0) : -1;
      const gapB = b.topCompetitor ? b.topCompetitor.rate - (b.brandRate ?? 0) : -1;
      return gapB - gapA;
    })
    .slice(0, TOP_PROMPTS);

  const totalLandscape = landscapeCounts.brand + landscapeCounts.competitor + landscapeCounts.community + landscapeCounts.other;
  const pct = (n: number) => (totalLandscape > 0 ? Math.round((n / totalLandscape) * 100) : 0);

  const digest: OpportunityDigest = {
    brandDomain,
    overallVisibilityRate: overallTotal > 0 ? Math.round((overallMentioned / overallTotal) * 100) : null,
    platformVisibility: [...platformAgg.entries()]
      .map(([platform, { mentioned, total }]) => ({ platform, rate: total > 0 ? Math.round((mentioned / total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate),
    citationLandscape: {
      brandPercent: pct(landscapeCounts.brand),
      competitorPercent: pct(landscapeCounts.competitor),
      communityPercent: pct(landscapeCounts.community),
      otherPercent: pct(landscapeCounts.other),
      topThirdParty: topN(thirdPartyCounts, 10),
      topCommunity: topN(communityCounts, 5),
      topCompetitorOwned: topN(competitorOwnedCounts, 8),
    },
    prompts: sortedPrompts,
  };

  return { digest, promptIdByText, citationsByPromptId };
}

// Strips punctuation/whitespace differences (a trailing "?", curly vs
// straight quotes, double spaces) that don't change what prompt the LLM
// meant, but do break an exact-text match against the real tracked-prompt
// list.
function fuzzyKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function enrichReport(raw: OpportunitiesReport, promptIdByText: Map<string, string>, citationsByPromptId: Map<string, CitationRecord[]>): EnrichedOpportunitiesReport {
  const lowerMap = new Map([...promptIdByText.entries()].map(([text, id]) => [text.toLowerCase().trim(), id]));
  const fuzzyMap = new Map([...promptIdByText.entries()].map(([text, id]) => [fuzzyKey(text), id]));

  const opportunities = raw.opportunities.map((item) => {
    const promptRefs = item.relatedPrompts.map((text) => {
      const clean = text.replace(/^\*/, "").trim();
      const promptId = promptIdByText.get(clean) ?? lowerMap.get(clean.toLowerCase()) ?? fuzzyMap.get(fuzzyKey(clean)) ?? null;
      if (promptId === null) {
        // Distinguishes "this opportunity genuinely has no linked citation
        // data" (a real, silent zero) from "the LLM's relatedPrompts text
        // didn't match any tracked prompt" (a matching bug) - without this,
        // both render identically as an empty citations list with no way
        // to tell them apart.
        console.warn(`[ai-visibility/opportunities] relatedPrompts text didn't match any tracked prompt: "${clean}"`);
      }
      return { promptId, promptText: clean };
    });

    const matchedIds = promptRefs.map((r) => r.promptId).filter((id): id is string => id !== null);
    const merged = new Map<string, CitationRecord>();
    for (const id of matchedIds) {
      for (const c of citationsByPromptId.get(id) ?? []) {
        const existing = merged.get(c.url);
        if (existing) existing.count += c.count;
        else merged.set(c.url, { ...c });
      }
    }
    const all = [...merged.values()].sort((a, b) => b.count - a.count);
    const strip = (c: CitationRecord) => ({ url: c.url, title: c.title, domain: c.domain, count: c.count });

    return {
      category: item.category,
      title: item.title,
      why: item.why,
      promptRefs,
      yourCitations: all.filter((c) => c.category === "brand").slice(0, 8).map(strip),
      competitorCitations: all.filter((c) => c.category === "competitor").slice(0, 8).map(strip),
    };
  });

  return { summary: raw.summary, risks: raw.risks, opportunities };
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const latest = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(aiVisibilityOpportunityReports)
      .where(eq(aiVisibilityOpportunityReports.projectId, projectId))
      .orderBy(desc(aiVisibilityOpportunityReports.createdAt))
      .limit(1);
    return row ?? null;
  });

  return NextResponse.json({
    report: latest?.report ?? null,
    provider: latest?.provider ?? null,
    model: latest?.model ?? null,
    generatedAt: latest?.createdAt ?? null,
  });
});

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const built = await withUserContext(session.user.id, (tx) => buildDigest(tx, projectId, project.domain, project.name));
  if (!built) {
    return NextResponse.json({ error: "Add tracked prompts on the Visibility page first." }, { status: 400 });
  }

  const generated = await generateOpportunitiesReport(built.digest, project.aiVisibilityContext ?? undefined);
  if (!generated) {
    return NextResponse.json(
      { error: "No LLM provider capable of structured research is configured (OpenRouter, OpenAI, or Anthropic)." },
      { status: 422 },
    );
  }

  const enriched = enrichReport(generated.report, built.promptIdByText, built.citationsByPromptId);

  const saved = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .insert(aiVisibilityOpportunityReports)
      .values({ projectId, report: enriched, provider: generated.provider, model: generated.model ?? null })
      .returning();
    return row!;
  });

  return NextResponse.json({ report: saved.report, provider: saved.provider, model: saved.model, generatedAt: saved.createdAt }, { status: 201 });
});
