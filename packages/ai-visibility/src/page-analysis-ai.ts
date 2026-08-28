import { z } from "zod";
import { getProvider } from "./providers";

// Page Analyzer's one structured AI call - real crawl/keyword/competitor
// summaries in, structured recommendations + candidate keyword phrases +
// suggested AI-visibility prompts out. Same runStructuredResearch + zod
// pattern as visibility-opportunity.ts/onboarding-research.ts, but this
// feature is explicitly OpenRouter-only per user request (no fallback to
// the direct-API providers) - if OpenRouter isn't configured, callers get
// a "not_configured" outcome and should render an honest "configure
// OpenRouter" state. A real call that fails after retries (bad model
// response, network error, rate limit) is reported separately as "failed"
// so that case isn't silently indistinguishable from never having a key
// set at all - a user who genuinely has OPENROUTER_API_KEY set needs to
// see "generation failed, try again," not "configure OpenRouter."

const priority = z.enum(["high", "medium", "low"]);

const recommendationSchema = z.object({
  title: z.string(),
  why: z.string(),
  priority,
});
export type PageAnalysisRecommendation = z.infer<typeof recommendationSchema>;

const suggestedPromptSchema = z.object({
  text: z.string(),
  rationale: z.string(),
});
export type SuggestedPrompt = z.infer<typeof suggestedPromptSchema>;

const pageAnalysisSchema = z.object({
  rankingRecommendations: z.array(recommendationSchema),
  aiVisibilityRecommendations: z.array(recommendationSchema),
  keywordOpportunities: z.array(z.string()),
  suggestedPrompts: z.array(suggestedPromptSchema),
});
export type PageAnalysisAiResult = z.infer<typeof pageAnalysisSchema>;

export interface PageAnalysisAiInput {
  url: string;
  targetKeyword: string;
  crawlSummary: string;
  keywordSummary: string;
  competitorSummary: string;
  keywordUsageSummary: string;
  // Real, rule-based page-type detection (detectPageType, @seo-tool/crawler)
  // - e.g. "Page type: product (high confidence - JSON-LD declares @type
  // \"Product\")". Lets the model tailor advice (product pricing/reviews
  // vs. article depth vs. category structure) instead of giving generic
  // content advice to every page regardless of what it actually is.
  pageTypeSummary: string;
  // Real domain-authority/traffic sizing (resolveDomainSnapshot) for the
  // top sized competitors, one line each, explicitly stating which are
  // realistic near-term targets vs. much bigger - empty string when sizing
  // wasn't available (never fabricated).
  competitorStrengthSummary: string;
}

const GUIDANCE = `You are an expert SEO and AI-search-visibility strategist reviewing one real page against its real top-10 Google competitors for one real target keyword.

Give specific, prioritized, actionable guidance grounded in the real data below - never generic SEO advice, always reference the actual gaps you see (content depth, missing on-page elements, structure, etc.).`;

const TASK = `Using ONLY the data below, return a JSON object with exactly these keys:
- rankingRecommendations: array of 4-8 objects, each {"title": string, "why": string, "priority": "high"|"medium"|"low"}. Each is a specific step to help this page outrank the real competitors listed for this exact keyword. When a competitor-strength breakdown is provided below, explicitly prioritize strategy around the realistically beatable competitors identified there (e.g. "focus content/backlink effort on overtaking position 4, not position 1" if position 4 is flagged similar/smaller and position 1 is flagged much bigger) rather than generic advice that ignores which competitors are actually catchable. When the page type below is "product", also factor in any real price/rating/stock positioning data given for this page and its competitors.
- aiVisibilityRecommendations: array of 4-8 objects, same {"title", "why", "priority"} shape. Each is a specific step to make this page's content more likely to be cited by AI answer engines (ChatGPT, Perplexity, Google AI Overviews) - focus on structure, clarity, citability, and E-E-A-T signals.
- keywordOpportunities: array of 6-10 plain strings (not objects) - real candidate keyword phrases (not the target keyword itself) this page's actual content and topic could realistically also rank for, grounded in what the page covers and gaps vs. competitors. These are just candidate phrases - real search volume/difficulty gets attached separately, don't invent numbers.
- suggestedPrompts: array of 4-6 objects, each {"text": string, "rationale": string} - a realistic prompt a real person might type into ChatGPT/Perplexity/an AI assistant where this specific page's content should be a strong, citable answer, plus a one-sentence rationale.

Every item in rankingRecommendations, aiVisibilityRecommendations, and suggestedPrompts MUST be an object with exactly the fields named above - never a plain string. Don't repeat the same point across sections. Respond with ONLY a JSON object matching this shape, no markdown fences, no commentary.`;

function buildPrompt(input: PageAnalysisAiInput): string {
  return `${GUIDANCE}

Page: ${input.url}
Target keyword: ${input.targetKeyword}

${input.pageTypeSummary}

Real on-page crawl data:
${input.crawlSummary}

Real target-keyword usage on this page:
${input.keywordUsageSummary}

Real keyword data:
${input.keywordSummary}

Real top-ranking competitors for this keyword (Google SERP):
${input.competitorSummary}
${input.competitorStrengthSummary ? `\nReal competitor domain-strength breakdown (who's actually beatable):\n${input.competitorStrengthSummary}\n` : ""}
=== TASK ===
${TASK}`;
}

// Matches the default already proven reliable for structured JSON output
// elsewhere in this package (visibility-opportunity.ts) - gpt-5-mini under
// plain json_object mode was observed dropping the nested object shape for
// list items (returning bare strings instead of {title, why, priority}).
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;

export type PageAnalysisAiOutcome =
  | { status: "ok"; result: PageAnalysisAiResult; model?: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function generatePageAnalysisAi(input: PageAnalysisAiInput): Promise<PageAnalysisAiOutcome> {
  const provider = getProvider("openrouter");
  if (!provider?.isConfigured() || !provider.runStructuredResearch) return { status: "not_configured" };

  const model = process.env.PAGE_ANALYZER_OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(input);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object, modelVersion } = await provider.runStructuredResearch({
        prompt,
        schema: pageAnalysisSchema,
        webSearch: false,
        model,
        // This schema (two 4-8 item recommendation lists + up to 10 keyword
        // candidates + up to 6 prompts) is heavier than the 2000-token
        // default other callers use - that default was truncating the JSON
        // mid-string and failing every attempt.
        maxTokens: 4000,
      });
      return { status: "ok", result: object, model: modelVersion ?? model };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[ai-visibility] generatePageAnalysisAi via openrouter failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return { status: "failed", error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}
