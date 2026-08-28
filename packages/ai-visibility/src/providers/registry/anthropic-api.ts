import type { Provider, ScrapeResult, StructuredResearchOptions, StructuredResearchResult } from "../types";
import { dedupeCitations } from "../text-extraction";
import { PLAIN_SAMPLE_TIMEOUT_MS, STRUCTURED_RESEARCH_TIMEOUT_MS, WEB_SEARCH_SAMPLE_TIMEOUT_MS } from "../constants";
import { fromAnthropicResponse, toAnthropicMessages, toAnthropicTools, type AgenticChatOptions, type AgenticChatResult } from "../agentic";

// Direct Anthropic Messages API call - same model this project has always
// used for AI Visibility sampling (claude-haiku-4-5). Web search is off by
// default (matches pre-existing cost profile) but, when a caller sets
// options.webSearch, wires in Anthropic's native `web_search_20250305`
// server tool (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) -
// verified against Anthropic's own docs, not guessed. Real search queries
// come back as `server_tool_use` blocks (name: "web_search", input.query);
// real citations come back as `citations` on the text blocks the same way
// they already did without web search, so extractCitations needed no change.
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 5 };

function extractCitations(data: any) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const items: Array<{ url: unknown; title?: unknown }> = [];
  for (const block of blocks) {
    for (const c of block?.citations ?? []) {
      if (c?.url) items.push({ url: c.url, title: c.title });
    }
  }
  return dedupeCitations(items);
}

// A web-search turn interleaves text/server_tool_use/web_search_tool_result
// blocks (see docs example: "I'll search..." -> server_tool_use -> result ->
// "Based on the search results, " -> final answer) - concatenating every
// text block (not just content[0]) is required to get the real final answer
// instead of just Claude's "I'll search for..." preamble.
function extractTextContent(data: any): string {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("");
}

// Real search queries Claude actually issued, from `server_tool_use` blocks
// (type: "server_tool_use", name: "web_search", input: {query}) - per
// Anthropic's documented response shape, not fabricated/derived from the
// prompt.
function extractWebQueries(data: any): string[] {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b: any) => b?.type === "server_tool_use" && b?.name === "web_search" && typeof b?.input?.query === "string")
    .map((b: any) => b.input.query.trim())
    .filter((q: string) => q.length > 0);
}

// Anthropic's own usage field names (input_tokens/output_tokens) - distinct
// from the OpenAI-style prompt_tokens/completion_tokens shared by
// OpenAI/Perplexity/OpenRouter (see extractOpenAiStyleUsage).
function extractUsage(data: any): { promptTokens: number; completionTokens: number } | undefined {
  const usage = data?.usage;
  if (typeof usage?.input_tokens !== "number" || typeof usage?.output_tokens !== "number") return undefined;
  return { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens };
}

export const anthropicApi: Provider = {
  id: "anthropic",
  name: "Anthropic",
  access: "api",

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY;
  },

  async run(_model: string, prompt: string, options): Promise<ScrapeResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const webSearch = options?.webSearch === true;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: options?.maxTokens ?? 1200,
        messages: [{ role: "user", content: prompt }],
        ...(webSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
      }),
      signal: AbortSignal.timeout(webSearch ? WEB_SEARCH_SAMPLE_TIMEOUT_MS : PLAIN_SAMPLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      textContent: extractTextContent(data) || (data.content?.[0]?.text ?? ""),
      webQueries: webSearch ? extractWebQueries(data) : [],
      citations: extractCitations(data),
      modelVersion: data?.model ?? "claude-haiku-4-5",
      usage: extractUsage(data),
      // Best-effort: `data` is already the parsed response, so this can't
      // realistically throw - kept as a plain assignment (not a try/catch)
      // rather than pretending otherwise.
      rawOutput: data,
    };
  },

  async runStructuredResearch<T>({ prompt, schema }: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const jsonInstruction =
      "\n\nRespond with ONLY a single valid JSON object matching the requested shape - no markdown code fences, no commentary before or after.";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt + jsonInstruction }],
      }),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic structured research error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Anthropic returned no JSON content");
    return { object: schema.parse(JSON.parse(match[0])), modelVersion: data?.model ?? "claude-haiku-4-5", usage: extractUsage(data) };
  },

  async chat(options: AgenticChatOptions): Promise<AgenticChatResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: options.model,
        // Anthropic's system prompt is a real top-level field, not a
        // message in the array (unlike OpenAI's role:"system" convention).
        system: options.systemPrompt,
        max_tokens: options.maxTokens ?? 1200,
        messages: toAnthropicMessages(options.messages),
        tools: toAnthropicTools(options.tools),
      }),
      signal: AbortSignal.timeout(STRUCTURED_RESEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic chat error ${res.status}: ${await res.text()}`);
    return fromAnthropicResponse(await res.json());
  },
};
