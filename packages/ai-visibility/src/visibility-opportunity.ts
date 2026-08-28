import { z } from "zod";
import { getProvider, type Provider } from "./providers";

// LLM-generated "what to do next" digest report - a deterministic digest of
// real tracking data (per-prompt brand-vs-competitor standing, citation
// ownership mix, which sources are "locked in" vs. contestable) gets fed
// into ONE structured LLM completion (no web search - the digest already
// carries every real fact the model needs) that returns a prioritized,
// categorized action list. Digest building + enrichment (resolving relatedPrompts
// back to real prompt IDs, splitting citations into yours-vs-competitors')
// stay in the API route - this package has no DB dependency, matching
// fanout-analysis.ts's "operate on passed-in data" convention.

export type OpportunityDifficulty = "wide-open" | "contested" | "locked-in";

export interface OpportunityDigestPrompt {
  promptText: string;
  tags: string[];
  branded: boolean;
  brandRate: number | null; // 0-100 over the digest's primary window, or null if never checked
  brandRate7d: number | null; // 0-100 over the last 7 days, for momentum
  topCompetitor: { domain: string; rate: number; rate7d: number | null } | null;
  // How much the set of cited domains churns day to day for this prompt -
  // "locked-in" means the same few sources keep winning (harder to break
  // in), "wide-open" means no source dominates yet.
  difficulty: OpportunityDifficulty;
  citedDomains: string[]; // top non-brand domains cited in answers to this prompt
}

export interface OpportunityPlatformVisibility {
  platform: string; // friendly model/surface label, e.g. "ChatGPT", "Gemini"
  rate: number; // 0-100
}

export interface OpportunityCitationLandscape {
  brandPercent: number;
  competitorPercent: number;
  communityPercent: number; // forums/social (reddit, quora, etc.)
  otherPercent: number; // editorial/reviews/ecommerce/developer/pr/reference/institutional/other
  topThirdParty: string[];
  topCommunity: string[];
  topCompetitorOwned: string[];
}

export interface OpportunityDigest {
  brandDomain: string;
  overallVisibilityRate: number | null;
  platformVisibility: OpportunityPlatformVisibility[];
  citationLandscape: OpportunityCitationLandscape;
  prompts: OpportunityDigestPrompt[]; // pre-sorted, biggest brand-vs-leader gap first
}

const opportunityCategorySchema = z.enum(["creation", "existing-content", "outreach", "social"]);
export type OpportunityCategory = z.infer<typeof opportunityCategorySchema>;

const opportunityItemSchema = z.object({
  category: opportunityCategorySchema,
  title: z.string(),
  why: z.string(),
  relatedPrompts: z.array(z.string()).default([]),
});
export type OpportunityItem = z.infer<typeof opportunityItemSchema>;

const opportunitiesReportSchema = z.object({
  summary: z.array(z.string()),
  opportunities: z.array(opportunityItemSchema),
  risks: z.array(z.string()),
});
export type OpportunitiesReport = z.infer<typeof opportunitiesReportSchema>;

// The report actually persisted/rendered: relatedPrompts strings resolved to
// real prompt IDs (for deep-linking) plus the real citation records that
// back each opportunity, split by ownership - computed after the LLM call,
// not by the model itself.
export interface EnrichedOpportunityItem extends Omit<OpportunityItem, "relatedPrompts"> {
  promptRefs: Array<{ promptId: string | null; promptText: string }>;
  yourCitations: Array<{ url: string; title?: string; domain: string; count: number }>;
  competitorCitations: Array<{ url: string; title?: string; domain: string; count: number }>;
}
export interface EnrichedOpportunitiesReport {
  summary: string[];
  risks: string[];
  opportunities: EnrichedOpportunityItem[];
}

const GUIDANCE = `You are analyzing real AI-visibility tracking data for a brand. "Visibility" means the share of AI assistant answers that named the brand when responding to a tracked prompt - not search rank, not market share. Each tracked prompt below shows: the brand's real mention rate (with a 7-day figure in parentheses for momentum), the best-performing tracked competitor's rate, a difficulty label (wide-open = no source dominates yet, contested = it's split between a few sources, locked-in = the same sources win repeatedly), any topic tags in [brackets], and the top real domains AI answers cite for that prompt. Prompts starting with "*" are branded (they already name the brand) - unbranded prompts are where new visibility is actually won, so weight those higher.

Ground every recommendation in the data above - never invent facts about a page's content (you cannot see inside cited pages, only that they were cited), never suggest editing a competitor-owned domain, never recommend fake/incentivized reviews or manipulating any platform. Prefer concrete, affordable actions over generic SEO advice. Sort recommendations into exactly one of four categories:
- "creation": net-new content worth publishing for a gap the brand doesn't cover yet
- "existing-content": updates/promotion for content the brand likely already has, or pages already cited that are slipping
- "outreach": earning inclusion on the third-party roundups/review sites/comparison pages AI answers actually cite
- "social": community and forum presence (Reddit, Quora, YouTube, developer communities) that AI answers pull from`;

const TASK = `Using ONLY the data above, return:
- summary: 3-5 short bullets (about 20 words each) naming the real competitive gaps and where AI sources its answers - don't restate the raw visibility numbers, just the takeaway.
- opportunities: 8-12 prioritized recommendations (highest impact first), each with a category, a short specific action-oriented title, a one-to-two sentence plain-language "why", and the tracked prompts (verbatim, exact text) it would help - may be empty if none apply. Spread them across categories the data actually supports; don't force all four if the data doesn't warrant it.
- risks: 2-4 short caveats - hard-to-win/locked-in areas, or tactics to avoid.`;

function formatRate(rate: number | null): string {
  return rate === null ? "never checked" : `${rate}%`;
}

function buildPrompt(digest: OpportunityDigest, brandContext?: string): string {
  const overallLine = `Overall brand visibility: ${formatRate(digest.overallVisibilityRate)}.`;
  const platformLines =
    digest.platformVisibility.length > 0
      ? `Per-platform visibility: ${digest.platformVisibility.map((p) => `${p.platform} ${p.rate}%`).join(", ")}.`
      : "";

  const promptLines = digest.prompts
    .map((p) => {
      const brand = `you ${formatRate(p.brandRate)}${p.brandRate7d !== null ? ` (7d ${p.brandRate7d}%)` : ""}`;
      const competitor = p.topCompetitor
        ? `top rival ${p.topCompetitor.domain} ${p.topCompetitor.rate}%${p.topCompetitor.rate7d !== null ? ` (7d ${p.topCompetitor.rate7d}%)` : ""}`
        : "no competitor data";
      const tags = p.tags.length > 0 ? ` [${p.tags.join(", ")}]` : "";
      const citedVia = p.citedDomains.length > 0 ? `; cited via: ${p.citedDomains.join(", ")}` : "";
      return `${p.branded ? "*" : ""}"${p.promptText}"${tags} — ${brand}, ${competitor}, difficulty ${p.difficulty}${citedVia}`;
    })
    .join("\n");

  const landscape = digest.citationLandscape;
  const landscapeLine = `Citation source mix: brand ${landscape.brandPercent}%, competitors ${landscape.competitorPercent}%, community/forums ${landscape.communityPercent}%, other third-party ${landscape.otherPercent}%.`;
  const thirdPartyLine = landscape.topThirdParty.length > 0 ? `Top third-party domains cited: ${landscape.topThirdParty.join(", ")}.` : "";
  const communityLine = landscape.topCommunity.length > 0 ? `Top community domains cited: ${landscape.topCommunity.join(", ")}.` : "";
  const competitorOwnedLine = landscape.topCompetitorOwned.length > 0 ? `Top competitor-owned domains cited: ${landscape.topCompetitorOwned.join(", ")}.` : "";

  return `${GUIDANCE}

=== BRAND DATA (${digest.brandDomain}) ===
${overallLine}
${platformLines}

Tracked prompts, ranked by biggest gap vs. the leading competitor:
${promptLines}

${landscapeLine}
${thirdPartyLine}
${communityLine}
${competitorOwnedLine}
${brandContext ? `\nBrand context: ${brandContext}` : ""}

=== TASK ===
${TASK}

Respond with ONLY a JSON object matching the required schema.`;
}

// Only direct-API providers with runStructuredResearch implemented can
// produce this (openrouter, openai, anthropic). Preference order puts
// OpenRouter first specifically so this feature defaults to a real Gemini
// model (see DEFAULT_OPPORTUNITIES_MODEL) rather than needing a separate
// OpenAI/Anthropic key - overridable per-deployment via env.
const DEFAULT_OPPORTUNITIES_MODEL = "google/gemini-2.5-flash";

function pickStructuredResearchProvider(): { provider: Provider; model?: string } | undefined {
  for (const id of ["openrouter", "openai", "anthropic"]) {
    const provider = getProvider(id);
    if (!provider?.isConfigured() || !provider.runStructuredResearch) continue;
    const model = id === "openrouter" ? process.env.OPPORTUNITIES_OPENROUTER_MODEL?.trim() || DEFAULT_OPPORTUNITIES_MODEL : undefined;
    return { provider, model };
  }
  return undefined;
}

const MAX_ATTEMPTS = 3;

export async function generateOpportunitiesReport(
  digest: OpportunityDigest,
  brandContext?: string,
): Promise<{ report: OpportunitiesReport; provider: string; model?: string } | null> {
  const picked = pickStructuredResearchProvider();
  const runStructuredResearch = picked?.provider.runStructuredResearch;
  if (!picked || !runStructuredResearch) return null;
  const { provider, model } = picked;
  const prompt = buildPrompt(digest, brandContext);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object, modelVersion } = await runStructuredResearch({
        prompt,
        schema: opportunitiesReportSchema,
        webSearch: false,
        model,
        // This schema (3-5 summary bullets, 8-12 opportunities each with a
        // title/why/verbatim related-prompt list, 2-4 risks) realistically
        // runs well past the 2000-token default other callers use - same
        // truncation risk that was already fixed for Page Analyzer's
        // structured call (see page-analysis-ai.ts's comment on this same
        // parameter).
        maxTokens: 4000,
      });
      return { report: object, provider: provider.id, model: modelVersion ?? model };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[ai-visibility] generateOpportunitiesReport via ${provider.id} failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return null;
}
