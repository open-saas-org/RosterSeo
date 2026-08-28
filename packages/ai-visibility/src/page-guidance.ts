import type { AiVisibilityProvider } from "./types";
import { callProvider, pickConfiguredProvider } from "./llm-caller";

// Generic freeform-prompt LLM guidance for Page Analyzer - distinct from
// client.ts's samplePrompt()/runVisibilityCheck(), which are locked to the
// narrow "does the LLM mention this brand" contract.

export interface PageGuidanceInput {
  url: string;
  targetKeyword: string;
  crawlSummary: string;
  keywordSummary: string;
  competitorSummary: string;
}

export interface PageGuidanceResult {
  rankingGuidance: string;
  aiVisibilityGuidance: string;
  provider: AiVisibilityProvider;
}

const RANKING_HEADING = "## Ranking guidance";
const AI_VISIBILITY_HEADING = "## AI visibility guidance";

function buildPrompt(input: PageGuidanceInput): string {
  return `You are an expert SEO and AI-search-visibility strategist.

Page being analyzed: ${input.url}
Target keyword: ${input.targetKeyword}

On-page crawl summary:
${input.crawlSummary}

Real keyword data:
${input.keywordSummary}

Top-ranking competitors for this keyword (real Google SERP):
${input.competitorSummary}

Write two sections in your reply, each starting with EXACTLY this markdown heading on its own line (no other text on that line):

${RANKING_HEADING}
Specific, prioritized, actionable steps this page needs to outrank the competitors listed above for this exact keyword. Reference the actual gaps you see (content depth, missing on-page elements, etc.) - do not give generic SEO advice.

${AI_VISIBILITY_HEADING}
Specific, prioritized, actionable steps to make this page's content more likely to be cited or referenced by AI answer engines (ChatGPT, Perplexity, Google AI Overviews) when someone asks about this topic. Focus on structure, clarity, citability, and the E-E-A-T signals AI systems favor.

Keep each section to 4-8 concrete bullet points. Do not repeat the same advice in both sections.`;
}

function splitSections(text: string): { rankingGuidance: string; aiVisibilityGuidance: string } {
  const aiIdx = text.indexOf(AI_VISIBILITY_HEADING);
  if (aiIdx === -1) {
    // Heading format wasn't followed exactly - return everything as ranking
    // guidance rather than silently dropping the response.
    return { rankingGuidance: text.replace(RANKING_HEADING, "").trim(), aiVisibilityGuidance: "" };
  }
  const rankingPart = text.slice(0, aiIdx).replace(RANKING_HEADING, "").trim();
  const aiPart = text.slice(aiIdx).replace(AI_VISIBILITY_HEADING, "").trim();
  return { rankingGuidance: rankingPart, aiVisibilityGuidance: aiPart };
}

// Picks the first configured provider (openai > anthropic > google >
// perplexity) and asks it for ranking + AI-visibility guidance. Returns
// null when no provider is configured at all, so the caller can render an
// honest "connect a provider" state instead of blocking the rest of the
// (still fully real) report.
export async function generatePageGuidance(input: PageGuidanceInput): Promise<PageGuidanceResult | null> {
  const provider = pickConfiguredProvider();
  if (!provider) return null;

  try {
    const text = await callProvider(provider, buildPrompt(input), 1200);
    const { rankingGuidance, aiVisibilityGuidance } = splitSections(text);
    return { rankingGuidance, aiVisibilityGuidance, provider };
  } catch (err) {
    console.error(`[ai-visibility] generatePageGuidance via ${provider} failed:`, err);
    return null;
  }
}
