import { z } from "zod";

// The four LLM providers PRD Section 5.7 calls out. Kept as a const tuple
// (not just a union) so callers can iterate over it - e.g. "run every
// provider" in the API route and the page both do `AI_VISIBILITY_PROVIDERS.map(...)`.
export const AI_VISIBILITY_PROVIDERS = ["openai", "anthropic", "google", "perplexity"] as const;

export const aiVisibilityProviderSchema = z.enum(AI_VISIBILITY_PROVIDERS);
export type AiVisibilityProvider = z.infer<typeof aiVisibilityProviderSchema>;

// Display labels for every provider id in the registry (packages/ai-visibility/src/providers/) -
// includes the original 4 direct APIs plus BrightData/OpenRouter. Kept as
// Record<string, string> (not Record<AiVisibilityProvider, string>) since a
// project's aiVisibilityTargets can reference any of the 6.
export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  perplexity: "Perplexity",
  brightdata: "BrightData",
  openrouter: "OpenRouter",
};

// BrightData surface -> the real product name a user recognizes, not the
// internal registry/model id.
const BRIGHTDATA_MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  copilot: "Copilot",
  "google-ai-overview": "Google AI Overview",
};

// Friendly display label for one sampled (provider, model) target - what
// the UI shows instead of the raw provider id, since "BrightData"/
// "OpenRouter" are backend routing details a user doesn't need to see when
// what they actually care about is *which AI* was sampled.
// ("brightdata","chatgpt") -> "ChatGPT"; ("openrouter","anthropic/claude-sonnet-5") -> "Claude Sonnet 5";
// ("openai","openai") -> "OpenAI" (the 4 original direct APIs, where model === provider).
export function getModelDisplayLabel(provider: string, model?: string | null): string {
  if (provider === "brightdata" && model && BRIGHTDATA_MODEL_LABELS[model]) {
    return BRIGHTDATA_MODEL_LABELS[model];
  }
  if (provider === "openrouter" && model) {
    const slug = model.split("/").pop() ?? model;
    return slug
      .split(/[-_]/)
      .map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
      .join(" ");
  }
  return PROVIDER_LABELS[provider] ?? provider;
}

// Which (provider, model) an AI Visibility sampling run targets - mirrors
// projects.aiVisibilityTargets (packages/db/src/app-schema.ts). `provider` is
// a registry id (packages/ai-visibility/src/providers); `model` is the AI
// surface for providers that front more than one (BrightData's
// chatgpt/gemini/perplexity/copilot/google-ai-overview, OpenRouter's model
// slug) - for the 4 original direct APIs, model === provider.
export interface AiVisibilityTarget {
  provider: string;
  model: string;
  version?: string;
  webSearch?: boolean;
  enabled?: boolean;
}

// A prompt counts as "branded" if it names the brand itself (by name or
// domain) - a real, deterministic check over the prompt text, not a stored
// classification. Mirrors the same substring-match convention client.ts uses
// for real mention detection.
export function isBrandedPrompt(promptText: string, brandName: string, brandDomain: string): boolean {
  const lower = promptText.toLowerCase();
  const nameLower = brandName.trim().toLowerCase();
  const domainRoot = brandDomain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(".")[0]
    ?.toLowerCase();
  return (!!nameLower && lower.includes(nameLower)) || (!!domainRoot && lower.includes(domainRoot));
}

export const sentimentSchema = z.enum(["positive", "neutral", "negative"]);
export type Sentiment = z.infer<typeof sentimentSchema>;

// Mirrors the shape of one row in the aiVisibilityResults table
// (packages/db/src/app-schema.ts) minus the DB-only fields (id, promptId,
// provider, runAt) - this is the "sample a prompt against one provider"
// contract a real implementation will fill in later.
export const promptSampleResultSchema = z.object({
  mentioned: z.boolean(),
  position: z.number().int().positive().nullable(),
  sentiment: sentimentSchema.nullable(),
  responseSnippet: z.string().nullable(),
});
export type PromptSampleResult = z.infer<typeof promptSampleResultSchema>;

// One (provider, sampleIndex) draw for a single tracked prompt - what
// runVisibilityCheck() produces per prompt, before it's persisted as rows
// in aiVisibilityResults.
export const providerSampleSchema = z.object({
  // A registry provider id (openai | anthropic | google | perplexity |
  // brightdata | openrouter) - widened from aiVisibilityProviderSchema so a
  // run against a project's custom aiVisibilityTargets can include
  // BrightData/OpenRouter results too.
  provider: z.string(),
  // The AI surface sampled, when it differs from `provider` (BrightData's
  // chatgpt/gemini/etc., OpenRouter's model slug) - lets the UI show a real
  // model name (getModelDisplayLabel) instead of just the backend id.
  model: z.string().optional(),
  sampleIndex: z.number().int().nonnegative(),
  result: promptSampleResultSchema,
});
export type ProviderSample = z.infer<typeof providerSampleSchema>;

export const trackedPromptInputSchema = z.object({
  id: z.string(),
  promptText: z.string().min(1),
});
export type TrackedPromptInput = z.infer<typeof trackedPromptInputSchema>;

// Full result of running one prompt across every requested provider/sample -
// what runVisibilityCheck() returns per prompt.
export const promptRunResultSchema = z.object({
  promptId: z.string(),
  promptText: z.string(),
  samples: z.array(providerSampleSchema),
});
export type PromptRunResult = z.infer<typeof promptRunResultSchema>;

export const runVisibilityCheckInputSchema = z.object({
  prompts: z.array(trackedPromptInputSchema).min(1),
  brandDomain: z.string().min(1),
  providers: z.array(aiVisibilityProviderSchema).optional(),
  samplesPerProvider: z.number().int().positive().max(10).optional(),
});
export type RunVisibilityCheckInput = z.infer<typeof runVisibilityCheckInputSchema>;
