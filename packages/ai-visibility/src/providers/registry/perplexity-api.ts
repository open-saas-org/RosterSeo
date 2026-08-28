import type { Provider, ScrapeResult } from "../types";
import { dedupeCitations, extractOpenAiStyleUsage } from "../text-extraction";
import { PLAIN_SAMPLE_TIMEOUT_MS, WEB_QUERIES_UNAVAILABLE } from "../constants";

// Direct Perplexity chat completions call (sonar model) - Perplexity always
// searches the web, and its sonar API is the one direct-API provider this
// project already got real citations from (a documented top-level
// `citations` array alongside `choices`, not something we construct).

export const perplexityApi: Provider = {
  id: "perplexity",
  name: "Perplexity",
  access: "api",

  isConfigured() {
    return !!process.env.PERPLEXITY_API_KEY;
  },

  async run(_model: string, prompt: string, options): Promise<ScrapeResult> {
    const apiKey = process.env.PERPLEXITY_API_KEY!;
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(PLAIN_SAMPLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Perplexity error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const rawCitations = Array.isArray(data.citations) ? data.citations : [];
    const citations = dedupeCitations(rawCitations.filter((c: unknown) => typeof c === "string").map((url: string) => ({ url })));
    return {
      textContent: data.choices?.[0]?.message?.content ?? "",
      // Perplexity always searches; it doesn't expose the literal query
      // strings it issued, so mark unavailable whenever citations prove a
      // real search happened.
      webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
      citations,
      modelVersion: "sonar",
      usage: extractOpenAiStyleUsage(data),
      rawOutput: data,
    };
  },
};
