import type { Provider, ScrapeResult } from "../types";
import { dedupeCitations } from "../text-extraction";
import { PLAIN_SAMPLE_TIMEOUT_MS, WEB_SEARCH_SAMPLE_TIMEOUT_MS } from "../constants";

// Direct Google AI (Gemini) generateContent call - same model this project
// has always used for AI Visibility sampling (gemini-2.0-flash). No
// grounding/citations in the plain generateContent response, so citations
// stay empty (never fabricated) - matches this project's prior behavior.
// When a caller sets options.webSearch, wires in the `google_search`
// grounding tool (Gemini's Generate Content API - the JSON tool field is
// documented as `google_search` even though most other REST fields on this
// API are camelCase; verified against Google's own docs, not guessed:
// https://ai.google.dev/gemini-api/docs/generate-content/google-search).
// A grounded response carries real search queries AND real source URLs in
// `candidates[0].groundingMetadata` (webSearchQueries / groundingChunks) -
// both genuinely new data this provider never surfaced before.

function extractTextContent(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p: any) => typeof p?.text === "string")
    .map((p: any) => p.text)
    .join("");
}

function extractWebQueries(data: any): string[] {
  const queries = data?.candidates?.[0]?.groundingMetadata?.webSearchQueries;
  if (!Array.isArray(queries)) return [];
  return queries.filter((q: unknown) => typeof q === "string" && q.trim()).map((q: string) => q.trim());
}

function extractCitations(data: any) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return dedupeCitations(chunks.map((c: any) => ({ url: c?.web?.uri, title: c?.web?.title })));
}

export const googleApi: Provider = {
  id: "google",
  name: "Google",
  access: "api",

  isConfigured() {
    return !!process.env.GOOGLE_AI_API_KEY;
  },

  async run(_model: string, prompt: string, options): Promise<ScrapeResult> {
    const apiKey = process.env.GOOGLE_AI_API_KEY!;
    const webSearch = options?.webSearch === true;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: options?.maxTokens ?? 1200 },
        ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(webSearch ? WEB_SEARCH_SAMPLE_TIMEOUT_MS : PLAIN_SAMPLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Google AI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const usageMetadata = data.usageMetadata;
    return {
      textContent: extractTextContent(data) || (data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""),
      webQueries: webSearch ? extractWebQueries(data) : [],
      citations: webSearch ? extractCitations(data) : [],
      modelVersion: "gemini-2.0-flash",
      usage:
        typeof usageMetadata?.promptTokenCount === "number" && typeof usageMetadata?.candidatesTokenCount === "number"
          ? { promptTokens: usageMetadata.promptTokenCount, completionTokens: usageMetadata.candidatesTokenCount }
          : undefined,
      rawOutput: data,
    };
  },
};
