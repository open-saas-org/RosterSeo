import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@seo-tool/db";
import { classifyUrl, getModelDisplayLabel, normalizeUrl } from "@seo-tool/ai-visibility";
import { getCurrentProject } from "@/lib/current-project";
import { PromptDetail } from "@/components/ai-visibility/prompt-detail";

// Capped at 6 total entities (brand + up to 5 tracked competitors) to match
// the validated categorical chart palette's 6 slots (dataviz skill) - same
// cap the parent Visibility page uses.
const MAX_COMPETITOR_ENTITIES = 5;

export default async function PromptDetailPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const { session, project } = await getCurrentProject();

  const data = await withUserContext(session.user.id, async (tx) => {
    const [prompt] = await tx
      .select()
      .from(aiVisibilityPrompts)
      .where(and(eq(aiVisibilityPrompts.id, promptId), eq(aiVisibilityPrompts.projectId, project.id)))
      .limit(1);
    if (!prompt) return null;

    const [competitors, results] = await Promise.all([
      tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, project.id)),
      tx.select().from(aiVisibilityResults).where(eq(aiVisibilityResults.promptId, promptId)),
    ]);

    const entities = [
      { key: "brand", label: project.name },
      ...competitors.slice(0, MAX_COMPETITOR_ENTITIES).map((c) => ({ key: c.domain, label: c.domain })),
    ];
    const entityKeys = new Set(entities.map((e) => e.key));
    // Flattened with each competitor's additionalDomains (Settings >
    // Competitors) so classifyUrl below still tags a citation on e.g. a
    // competitor's regional site as "competitor" - see
    // citation-classification.ts's classifyUrl doc comment.
    const competitorDomains = competitors.flatMap((c) => [c.domain, ...(c.additionalDomains ?? [])]);
    const brandDomains = [project.domain, ...(project.aiVisibilityAdditionalDomains ?? [])];

    const stats = results
      .filter((r) => entityKeys.has(r.entityDomain === null ? "brand" : r.entityDomain))
      .map((r) => ({
        date: r.runAt.toISOString().slice(0, 10),
        provider: r.provider,
        model: r.model ?? r.provider,
        entityKey: r.entityDomain === null ? "brand" : r.entityDomain,
        mentioned: r.mentioned ? 1 : 0,
        total: 1,
      }));

    // Brand-only rows (entityDomain IS NULL) - one row per real (prompt,
    // provider, sample) call. Competitor rows share the exact same
    // citations/webQueries/response from that same call, so including them
    // here would multiply-count everything by (1 + tracked competitors).
    const brandResults = results.filter((r) => r.entityDomain === null);

    const citationRows = brandResults.flatMap((r) => {
      const date = r.runAt.toISOString().slice(0, 10);
      const model = r.model ?? r.provider;
      return (r.citations ?? []).flatMap((raw) => {
        let citation: { url: string; title?: string; domain: string; citationIndex: number };
        if (typeof raw === "string") {
          try {
            citation = { url: raw, domain: new URL(raw).hostname.replace(/^www\./, ""), citationIndex: 0 };
          } catch {
            return [];
          }
        } else {
          citation = raw;
        }
        const { category, pageType } = classifyUrl(citation.url, citation.domain, citation.title, brandDomains, competitorDomains);
        return [
          {
            promptId,
            promptText: prompt.promptText,
            provider: r.provider,
            model,
            date,
            url: citation.url,
            normalizedUrl: normalizeUrl(citation.url),
            title: citation.title,
            domain: citation.domain,
            citationIndex: citation.citationIndex,
            category,
            pageType,
          },
        ];
      });
    });

    const webQueryRows = brandResults
      .filter((r) => Array.isArray(r.webQueries) && r.webQueries.length > 0)
      .map((r) => ({
        promptId,
        promptText: prompt.promptText,
        provider: r.provider,
        model: r.model ?? r.provider,
        date: r.runAt.toISOString().slice(0, 10),
        webQueries: r.webQueries as string[],
        mentioned: r.mentioned,
      }));

    // Every row (brand + tracked competitors) inserted by the same POST
    // .../run call shares one runId - used below to find which OTHER
    // brands/competitors were mentioned in that exact same run as each
    // brand row, for the LLM Responses tab's "also mentioned" line.
    const mentionedDomainsByRunId = new Map<string, string[]>();
    for (const r of results) {
      if (r.entityDomain === null || !r.mentioned) continue;
      const list = mentionedDomainsByRunId.get(r.runId) ?? [];
      list.push(r.entityDomain);
      mentionedDomainsByRunId.set(r.runId, list);
    }

    const llmResponses = [...brandResults]
      .sort((a, b) => b.runAt.getTime() - a.runAt.getTime())
      .map((r) => ({
        id: r.id,
        provider: r.provider,
        modelLabel: getModelDisplayLabel(r.provider, r.model),
        runAt: r.runAt.toISOString(),
        mentioned: r.mentioned,
        sentiment: r.sentiment,
        position: r.position,
        responseSnippet: r.responseSnippet,
        citationCount: r.citations?.length ?? 0,
        rawOutput: r.rawOutput ?? null,
        alsoMentioned: mentionedDomainsByRunId.get(r.runId) ?? [],
      }));

    const modelMap = new Map<string, string>();
    for (const r of brandResults) modelMap.set(r.model ?? r.provider, getModelDisplayLabel(r.provider, r.model));

    return {
      prompt: { id: prompt.id, promptText: prompt.promptText, tags: prompt.tags ?? [], enabled: prompt.enabled },
      entities,
      stats,
      citationRows,
      webQueryRows,
      llmResponses,
      allModels: [...modelMap.entries()].map(([value, label]) => ({ value, label })),
      brandDomain: project.domain,
    };
  });

  if (!data) notFound();

  return <PromptDetail {...data} />;
}
