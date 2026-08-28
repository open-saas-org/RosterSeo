// Shared catalog of selectable AI Visibility targets - used by both the
// Settings > Providers page (saved, per-project defaults) and the
// Visibility page's inline per-run selector (ad-hoc override, doesn't
// require a trip to Settings to pick a different set for one run). Kept in
// one place so the two stay in sync instead of drifting.

export type AiVisibilityCatalogEntry = {
  provider: string;
  model: string;
  label: string;
  webSearch: boolean;
  defaultEnabled: boolean;
};

// OpenRouter is flexible (any model slug), so it isn't listed here - both
// callers add it as one dynamic entry using whatever slug is currently
// configured (or DEFAULT_OPENROUTER_MODEL as a fallback).
export const AI_VISIBILITY_CATALOG: AiVisibilityCatalogEntry[] = [
  { provider: "openai", model: "openai", label: "OpenAI (direct)", webSearch: false, defaultEnabled: false },
  { provider: "anthropic", model: "anthropic", label: "Anthropic (direct)", webSearch: false, defaultEnabled: false },
  { provider: "google", model: "google", label: "Google (direct)", webSearch: false, defaultEnabled: false },
  { provider: "perplexity", model: "perplexity", label: "Perplexity (direct)", webSearch: false, defaultEnabled: false },
  { provider: "brightdata", model: "chatgpt", label: "ChatGPT (BrightData, scraped)", webSearch: true, defaultEnabled: true },
  { provider: "brightdata", model: "gemini", label: "Gemini (BrightData, scraped)", webSearch: true, defaultEnabled: true },
  { provider: "brightdata", model: "perplexity", label: "Perplexity (BrightData, scraped)", webSearch: true, defaultEnabled: true },
  { provider: "brightdata", model: "copilot", label: "Copilot (BrightData, scraped)", webSearch: true, defaultEnabled: true },
  { provider: "brightdata", model: "google-ai-overview", label: "Google AI Overview (BrightData)", webSearch: true, defaultEnabled: true },
];

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

export function targetKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}
