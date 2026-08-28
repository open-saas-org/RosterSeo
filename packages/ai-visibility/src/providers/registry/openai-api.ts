import type { Provider, ScrapeResult, StructuredResearchOptions, StructuredResearchResult } from "../types";
import { dedupeCitations, extractOpenAiStyleUsage } from "../text-extraction";
import { PLAIN_SAMPLE_TIMEOUT_MS, STRUCTURED_RESEARCH_TIMEOUT_MS, WEB_SEARCH_SAMPLE_TIMEOUT_MS } from "../constants";
import { fromOpenAiCompatibleResponse, toOpenAiCompatibleMessages, toOpenAiCompatibleTools, type AgenticChatOptions, type AgenticChatResult } from "../agentic";

// Direct OpenAI call. Same model this project has always used for AI
// Visibility sampling (gpt-4o-mini) - web search stays off by default
// (matches pre-existing cost profile), using the plain Chat Completions
// endpoint. When a caller sets options.webSearch, the Chat Completions
// endpoint can't actually do real web search for gpt-4o-mini (its "search"
// support there is limited to the separate gpt-4o-search-preview /
// gpt-4o-mini-search-preview model family, not a `tools: [...]` opt-in on
// the normal chat model - verified against OpenAI's own docs, not guessed),
// so the web-search path instead calls the Responses API
// (POST /v1/responses, `tools: [{type: "web_search"}]`) with the same
// gpt-4o-mini model, which *does* support the real web_search tool there.
// Real search queries come back as `web_search_call` output items
// (action.query); real citations come back as `url_citation` annotations on
// the output_text content the same shape OpenRouter's OpenAI-compatible
// responses already used, so extractCitations is reused for the
// Chat-Completions (non-search) path and a parallel extractor below handles
// the Responses API shape.

function extractCitations(data: any) {
  const annotations = data?.choices?.[0]?.message?.annotations ?? [];
  return dedupeCitations(
    annotations
      .filter((a: any) => a?.type === "url_citation")
      .map((a: any) => ({ url: a.url_citation?.url ?? a.url, title: a.url_citation?.title ?? a.title })),
  );
}

// Responses API output is an `output: [...]` array of typed items, not a
// `choices[0].message` object - a message item's `content` holds
// `output_text` blocks, each optionally carrying `annotations`.
function extractResponsesText(data: any): string {
  const output = Array.isArray(data?.output) ? data.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") texts.push(c.text);
    }
  }
  return texts.join("");
}

function extractResponsesCitations(data: any) {
  const output = Array.isArray(data?.output) ? data.output : [];
  const items: Array<{ url: unknown; title?: unknown }> = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c?.type !== "output_text") continue;
      for (const a of c.annotations ?? []) {
        if (a?.type === "url_citation" && a?.url) items.push({ url: a.url, title: a.title });
      }
    }
  }
  return dedupeCitations(items);
}

// Real queries the model actually issued, from `web_search_call` output
// items (type: "web_search_call", action: {type: "search", query}) - per
// OpenAI's documented Responses API shape.
function extractResponsesWebQueries(data: any): string[] {
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .filter((item: any) => item?.type === "web_search_call" && typeof item?.action?.query === "string")
    .map((item: any) => item.action.query.trim())
    .filter((q: string) => q.length > 0);
}

// The Responses API's usage object uses Anthropic-style input_tokens/
// output_tokens, not Chat Completions' prompt_tokens/completion_tokens -
// extractOpenAiStyleUsage (text-extraction.ts) doesn't match this shape.
function extractResponsesUsage(data: any) {
  const usage = data?.usage;
  if (typeof usage?.input_tokens !== "number" || typeof usage?.output_tokens !== "number") return undefined;
  return { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens };
}

export const openaiApi: Provider = {
  id: "openai",
  name: "OpenAI",
  access: "api",

  isConfigured() {
    return !!process.env.OPENAI_API_KEY;
  },

  async run(_model: string, prompt: string, options): Promise<ScrapeResult> {
    const apiKey = process.env.OPENAI_API_KEY!;

    if (options?.webSearch === true) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: prompt,
          tools: [{ type: "web_search" }],
          max_output_tokens: options?.maxTokens ?? 1200,
        }),
        signal: AbortSignal.timeout(WEB_SEARCH_SAMPLE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`OpenAI (Responses API, web search) error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return {
        textContent: extractResponsesText(data),
        webQueries: extractResponsesWebQueries(data),
        citations: extractResponsesCitations(data),
        modelVersion: data?.model ?? "gpt-4o-mini",
        usage: extractResponsesUsage(data),
        rawOutput: data,
      };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(PLAIN_SAMPLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      textContent: data.choices?.[0]?.message?.content ?? "",
      webQueries: [],
      citations: extractCitations(data),
      modelVersion: data?.model ?? "gpt-4o-mini",
      usage: extractOpenAiStyleUsage(data),
      rawOutput: data,
    };
  },

  async runStructuredResearch<T>({ prompt, schema }: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
    const apiKey = process.env.OPENAI_API_KEY!;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenAI structured research error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI returned no JSON content");
    return { object: schema.parse(JSON.parse(content)), modelVersion: data?.model ?? "gpt-4o-mini", usage: extractOpenAiStyleUsage(data) };
  },

  async chat(options: AgenticChatOptions): Promise<AgenticChatResult> {
    const apiKey = process.env.OPENAI_API_KEY!;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model,
        messages: toOpenAiCompatibleMessages(options.systemPrompt, options.messages),
        tools: toOpenAiCompatibleTools(options.tools),
        tool_choice: "auto",
        max_tokens: options.maxTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenAI chat error ${res.status}: ${await res.text()}`);
    return fromOpenAiCompatibleResponse(await res.json());
  },
};
