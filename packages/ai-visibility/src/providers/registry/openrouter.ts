import type { Provider, ProviderOptions, ScrapeResult, StructuredResearchOptions, StructuredResearchResult } from "../types";
import { dedupeCitations, extractOpenAiStyleUsage } from "../text-extraction";
import { STRUCTURED_RESEARCH_TIMEOUT_MS, WEB_QUERIES_UNAVAILABLE, WEB_SEARCH_SAMPLE_TIMEOUT_MS } from "../constants";
import { fromOpenAiCompatibleResponse, toOpenAiCompatibleMessages, toOpenAiCompatibleTools, type AgenticChatOptions, type AgenticChatResult } from "../agentic";

// A pass-through gateway to any OpenRouter-hosted model (Claude, GPT, Gemini,
// Llama, DeepSeek, etc.) via one API key - same per-token pricing as calling
// the underlying provider directly, but one integration instead of one per
// model family. Uses raw fetch (not the Vercel AI SDK), since the SDK's
// response schema strips the `annotations` field that carries real web
// citations.

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_RESEARCH_MODEL = "openai/gpt-5-mini";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    // `||`, not `??` - an empty-but-declared APP_URL= in .env is a real ""
    // string, not undefined, so `??` would never fall back.
    "HTTP-Referer": process.env.APP_URL?.trim() || "https://github.com/",
    "X-Title": "AI Visibility",
  };
}

function extractText(data: any): string {
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (Array.isArray(data?.output)) {
    const texts: string[] = [];
    for (const item of data.output) {
      if (item?.type !== "message") continue;
      for (const c of item.content ?? []) {
        if (c?.type === "output_text" && typeof c.text === "string") texts.push(c.text);
      }
    }
    if (texts.length) return texts.join("\n");
  }
  return "";
}

function extractCitations(data: any) {
  const annotations = data?.choices?.[0]?.message?.annotations ?? [];
  return dedupeCitations(
    annotations
      .filter((a: any) => a?.type === "url_citation")
      .map((a: any) => {
        const cite = a.url_citation ?? a;
        return { url: cite.url, title: cite.title };
      }),
  );
}

// OpenRouter, uniquely among this project's providers, can return a real
// dollar cost for the specific model it actually routed to (it fronts
// arbitrary third-party models at their own real pricing, so no static
// per-model table here could be accurate) - but only when the request
// explicitly opts in via `usage: { include: true }` in the body.
function extractCostUsd(data: any): number | undefined {
  return typeof data?.usage?.cost === "number" ? data.usage.cost : undefined;
}

export const openrouter: Provider = {
  id: "openrouter",
  name: "OpenRouter",
  access: "api",

  isConfigured() {
    return !!process.env.OPENROUTER_API_KEY;
  },

  // `model` is treated as the OpenRouter model slug (e.g. "anthropic/claude-sonnet-5")
  // unless options.version overrides it - matches how the Settings provider
  // picker (Phase H) will store a project's chosen slug.
  async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
    let modelSlug = options?.version ?? model;
    if (options?.webSearch && !modelSlug.includes(":online")) {
      // ":online" is exactly equivalent to plugins: [{id:"web"}], and with
      // the engine unset OpenRouter routes to the model's own native web
      // search where one exists, falling back to Exa otherwise.
      modelSlug = `${modelSlug}:online`;
    }
    const cleanSlug = modelSlug.replace(/:online$/, "");
    const body: Record<string, unknown> = {
      model: cleanSlug,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options?.maxTokens ?? 1200,
      usage: { include: true },
    };
    if (modelSlug.endsWith(":online")) body.plugins = [{ id: "web", engine: "native" }];

    // A web-search-enabled (:online) call can genuinely take longer than a
    // plain completion, since it does a real search underneath - a bit more
    // slack than the plain-completion timeout, but still bounded so a stuck
    // request can't hang the whole visibility run indefinitely.
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEB_SEARCH_SAMPLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
    const data = await res.json();

    const citations = extractCitations(data);
    return {
      textContent: extractText(data),
      webQueries: citations.length > 0 ? [WEB_QUERIES_UNAVAILABLE] : [],
      citations,
      modelVersion: data?.model ?? cleanSlug,
      usage: extractOpenAiStyleUsage(data),
      costUsd: extractCostUsd(data),
      rawOutput: data,
    };
  },

  async runStructuredResearch<T>({
    prompt,
    schema,
    webSearch = true,
    model,
    maxTokens,
  }: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
    const researchModel = model?.trim() || DEFAULT_RESEARCH_MODEL;
    const body: Record<string, unknown> = {
      model: researchModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: maxTokens ?? 2000,
      usage: { include: true },
    };
    if (webSearch) body.plugins = [{ id: "web", engine: "native" }];

    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error(`OpenRouter returned no JSON content (model=${researchModel})`);
    return {
      object: schema.parse(JSON.parse(content)),
      modelVersion: researchModel,
      usage: extractOpenAiStyleUsage(data),
      costUsd: extractCostUsd(data),
    };
  },

  // `model` is treated as a real OpenRouter slug directly (e.g.
  // "anthropic/claude-sonnet-5") - no `:online` handling here, unlike
  // run() above; a tool-calling turn's job is deciding which real in-app
  // tool to call, not doing its own separate web search.
  async chat(options: AgenticChatOptions): Promise<AgenticChatResult> {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: options.model,
        messages: toOpenAiCompatibleMessages(options.systemPrompt, options.messages),
        tools: toOpenAiCompatibleTools(options.tools),
        tool_choice: "auto",
        max_tokens: options.maxTokens ?? 1200,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouter chat error (${res.status}): ${await res.text()}`);
    return fromOpenAiCompatibleResponse(await res.json());
  },
};

export type OpenRouterModel = {
  id: string;
  name: string;
  contextLength: number;
  // Real per-token USD pricing OpenRouter reports for this model - null
  // when they don't publish one for it (a handful of free/experimental
  // slugs), never a guessed/estimated number.
  promptPriceUsdPerM: number | null;
  completionPriceUsdPerM: number | null;
};

// OpenRouter's public model catalog (no API key required - confirmed live)
// - real names/slugs/pricing/context length for every model they host, so
// Settings -> Providers can offer a real searchable picker instead of a
// free-text field the user has to already know the exact slug for.
// Cached in-memory for the life of the process (refreshed once an hour):
// this is reference data, not something that needs to be live to the
// second, and 417 real models is not a request worth repeating on every
// page load.
const MODEL_LIST_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { models: OpenRouterModel[]; fetchedAt: number } | null = null;

export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.models;

  const res = await fetch(MODEL_LIST_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter models list returned HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<Record<string, any>> };

  const models = (data.data ?? [])
    .filter((m) => typeof m.id === "string" && typeof m.name === "string")
    .map((m) => ({
      id: m.id as string,
      name: m.name as string,
      contextLength: typeof m.context_length === "number" ? m.context_length : 0,
      promptPriceUsdPerM: typeof m.pricing?.prompt === "string" ? Number(m.pricing.prompt) * 1_000_000 : null,
      completionPriceUsdPerM: typeof m.pricing?.completion === "string" ? Number(m.pricing.completion) * 1_000_000 : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { models, fetchedAt: Date.now() };
  return models;
}
