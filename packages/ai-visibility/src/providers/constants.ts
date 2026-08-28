// Load-bearing sentinel: written to a result's webQueries when a real web search demonstrably
// happened (citations prove it) but the provider's API didn't expose the
// actual query strings it searched for. Distinct from an empty array, which
// means no search happened at all. The Query Fan-Out aggregator (Phase C)
// filters this sentinel out of its analysis rather than treating it as a
// real captured query.
export const WEB_QUERIES_UNAVAILABLE = "unavailable";

// Deliberately coarse, hand-maintained per-run cost estimates (not real
// invoice-derived pricing) - shown in Settings as an honest "≈$X/run" hint,
// never presented as a real bill. Mapped onto this project's 6 registered
// provider ids.
export const PROVIDER_COST_ESTIMATES_USD: Record<string, number> = {
  openai: 0.01,
  anthropic: 0.01,
  google: 0.005,
  perplexity: 0.005,
  brightdata: 0.01,
  openrouter: 0.005,
};

// Shared request timeouts across every registry/*.ts provider - the values
// differ by call shape, not by accident, so they're named here instead of
// scattered as raw AbortSignal.timeout(N) literals with no explanation for
// why one provider's number differs from another's:
//   - PLAIN_SAMPLE_TIMEOUT_MS: a normal single-shot chat completion at the
//     ~1200-token default budget (anthropic/openai/google/perplexity/
//     brightdata's non-polling requests).
//   - WEB_SEARCH_SAMPLE_TIMEOUT_MS: OpenRouter's `run()` specifically, when
//     `:online` web search is enabled - a real underlying search adds
//     latency on top of the plain-completion case above.
//   - STRUCTURED_RESEARCH_TIMEOUT_MS: runStructuredResearch() calls, which
//     ask for a larger ~2000-token JSON response (and, for OpenRouter, real
//     web search too) - genuinely slower than a plain sample.
// BrightData's scrape-and-poll flow (trigger -> pollUntilReady -> fetch) is
// a different architecture entirely (an async job, not a single request)
// and keeps its own documented wall-clock budget in brightdata.ts rather
// than reusing these.
export const PLAIN_SAMPLE_TIMEOUT_MS = 30_000;
export const WEB_SEARCH_SAMPLE_TIMEOUT_MS = 45_000;
export const STRUCTURED_RESEARCH_TIMEOUT_MS = 60_000;

export const CITATION_PROVIDER_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  brightdata: "BRIGHTDATA_API_TOKEN",
};
