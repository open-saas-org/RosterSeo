// Real, human-readable display names for provider_spend_log's `provider`
// column values - shared between the Spend page's chart, cards, and table
// so the label never drifts between them.
export const PROVIDER_LABELS: Record<string, string> = {
  dataforseo: "DataForSEO",
  brightdata: "BrightData",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
};
