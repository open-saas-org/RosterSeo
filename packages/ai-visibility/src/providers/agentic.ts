import type { TokenUsage } from "./types";

// Clay (the in-app AI assistant, apps/web/lib/clay/*) is this package's one
// real multi-turn, tool-calling consumer - everything else (run,
// runStructuredResearch) is a single-shot call. Kept in its own file since
// the shapes here (tool defs, multi-role message history, tool_calls) don't
// fit ScrapeResult/StructuredResearchResult's single-answer shape.

// A tool definition - same JSON-Schema-parameters shape
// apps/mcp-server/src/index.ts's TOOLS array already uses, so Clay's real
// tool catalog (apps/web/lib/clay/tools/registry.ts) can be handed to
// either format converter below with no translation step.
export interface ClayToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ClayToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// A real multi-turn conversation, in the order they happened. "tool" rows
// answer a specific prior "assistant" tool call by id - both format
// converters below turn this generic shape into whatever wire format that
// provider actually expects (OpenAI-compatible role:"tool" messages vs.
// Anthropic's role:"user" + tool_result content blocks).
export type AgenticMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ClayToolCallRequest[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface AgenticChatOptions {
  model: string;
  systemPrompt: string;
  messages: AgenticMessage[];
  tools: ClayToolDef[];
  maxTokens?: number;
}

export interface AgenticChatResult {
  content: string | null;
  toolCalls: ClayToolCallRequest[];
  modelVersion?: string;
  usage?: TokenUsage;
  costUsd?: number;
  stopReason: "stop" | "tool_calls" | "length" | "error";
}

// ── OpenAI-compatible (OpenAI + OpenRouter share this exact wire shape) ────

export function toOpenAiCompatibleTools(tools: ClayToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// assistant.tool_calls[].function.arguments is a JSON *string* on the wire
// (not a nested object) - both directions of that encoding happen here so
// callers only ever deal with real parsed objects.
export function toOpenAiCompatibleMessages(systemPrompt: string, messages: AgenticMessage[]) {
  const out: Array<Record<string, unknown>> = [{ role: "system", content: systemPrompt }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

export function fromOpenAiCompatibleResponse(data: any): AgenticChatResult {
  const choice = data?.choices?.[0];
  const message = choice?.message;
  const rawToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const toolCalls: ClayToolCallRequest[] = rawToolCalls.map((tc: any) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function?.arguments ?? "{}");
    } catch {
      // A malformed arguments string is a real model error, not a crash -
      // the tool executor gets an empty object and (for any tool with
      // required params) reports a clear validation error back to the
      // model on the next turn, same as a real bad tool call would.
    }
    return { id: tc.id, name: tc.function?.name ?? "", arguments: args };
  });

  const finishReason = choice?.finish_reason;
  const stopReason: AgenticChatResult["stopReason"] =
    toolCalls.length > 0 ? "tool_calls" : finishReason === "length" ? "length" : finishReason === "stop" ? "stop" : "stop";

  const usage =
    typeof data?.usage?.prompt_tokens === "number" && typeof data?.usage?.completion_tokens === "number"
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined;

  return {
    content: typeof message?.content === "string" ? message.content : null,
    toolCalls,
    modelVersion: data?.model,
    usage,
    costUsd: typeof data?.usage?.cost === "number" ? data.usage.cost : undefined,
    stopReason,
  };
}

// ── Anthropic's distinct tool_use/tool_result block format ────────────────

export function toAnthropicTools(tools: ClayToolDef[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

export function toAnthropicMessages(messages: AgenticMessage[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      out.push({ role: "assistant", content });
    } else {
      // Anthropic has no "tool" role - a tool result is a user-role message
      // carrying a tool_result content block referencing the call by id.
      out.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] });
    }
  }
  return out;
}

export function fromAnthropicResponse(data: any): AgenticChatResult {
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const textBlock = blocks.find((b) => b?.type === "text");
  const toolCalls: ClayToolCallRequest[] = blocks
    .filter((b) => b?.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, arguments: (b.input as Record<string, unknown>) ?? {} }));

  const stopReason: AgenticChatResult["stopReason"] =
    toolCalls.length > 0 ? "tool_calls" : data?.stop_reason === "max_tokens" ? "length" : "stop";

  const usage =
    typeof data?.usage?.input_tokens === "number" && typeof data?.usage?.output_tokens === "number"
      ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
      : undefined;

  return {
    content: textBlock?.text ?? null,
    toolCalls,
    modelVersion: data?.model,
    usage,
    stopReason,
  };
}
