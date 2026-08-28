import { z } from "zod";
import { getProvider, type Provider } from "./providers";

// Automated onboarding research: one structured, web-search-enabled LLM
// call that researches a brand-new project's brand and suggests a starter
// AI Visibility setup for the user to review before saving - canonical
// brand identity, real competitors, and a prompt set that's deliberately
// mostly unbranded (to test organic AI mention behavior) with a handful of
// branded/comparison prompts.

export interface OnboardingCompetitorSuggestion {
  name: string;
  domains: string[];
  aliases: string[];
}

export interface OnboardingPromptSuggestion {
  text: string;
  branded: boolean;
}

export interface OnboardingResearch {
  canonicalName: string;
  additionalDomains: string[];
  aliases: string[];
  competitors: OnboardingCompetitorSuggestion[];
  suggestedPrompts: OnboardingPromptSuggestion[];
}

const researchSchema = z.object({
  canonicalName: z.string().min(1),
  additionalDomains: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  competitors: z
    .array(z.object({ name: z.string(), domains: z.array(z.string()), aliases: z.array(z.string()).default([]) }))
    .max(10)
    .default([]),
  suggestedPrompts: z.array(z.object({ text: z.string(), branded: z.boolean() })).max(30).default([]),
});

// Same provider preference (structured research capable) as the
// Opportunities digest report.
function pickResearchProvider(): Provider | undefined {
  for (const id of ["openrouter", "openai", "anthropic"]) {
    const provider = getProvider(id);
    if (provider?.isConfigured() && provider.runStructuredResearch) return provider;
  }
  return undefined;
}

function buildPrompt(name: string, website: string): string {
  return `Research the brand "${name}" (website: ${website}) using web search. Return a JSON object with:
- "canonicalName": the brand's real, correctly-capitalized name as it appears on its own site
- "additionalDomains": other domains this same company/brand owns, if any real ones are found (empty array otherwise)
- "aliases": alternate names or abbreviations people commonly use for this brand (empty array if none)
- "competitors": up to 10 real, direct competitors, each {"name", "domains": ["primary domain"], "aliases": []}
- "suggestedPrompts": 10-15 realistic questions a potential customer might type into an AI assistant (ChatGPT, Perplexity, Google AI Mode) while researching this category, where this brand or its competitors could plausibly come up. Aim for roughly 70-80% unbranded, generic-category questions (never naming any brand) and 3-5 branded questions that directly name "${name}" or a competitor (e.g. comparisons, "is X worth it"). Each item: {"text", "branded": true|false}.

Respond with ONLY the JSON object, no commentary, no markdown fences.`;
}

export async function analyzeBrand(name: string, website: string): Promise<OnboardingResearch | null> {
  const provider = pickResearchProvider();
  if (!provider?.runStructuredResearch) return null;

  try {
    const { object } = await provider.runStructuredResearch({
      prompt: buildPrompt(name, website),
      schema: researchSchema,
      webSearch: true,
      // Up to 10 competitors (name + domains[] + aliases[]) and up to 30
      // suggested prompts - same truncation risk class as this package's
      // other structured calls if a model follows the schema's real max
      // rather than the prompt's "10-15" guidance.
      maxTokens: 4000,
    });

    const canonicalLower = object.canonicalName.toLowerCase();
    // Drop redundant aliases (substrings of the canonical name), since
    // mention-matching is substring-based and a redundant alias adds
    // nothing.
    const aliases = [...new Set(object.aliases.map((a) => a.trim()).filter((a) => a && !canonicalLower.includes(a.toLowerCase())))];
    const additionalDomains = [...new Set(object.additionalDomains.map((d) => d.trim()).filter(Boolean))];

    return { ...object, aliases, additionalDomains };
  } catch (err) {
    console.error(`[ai-visibility] analyzeBrand via ${provider.id} failed:`, err);
    return null;
  }
}
