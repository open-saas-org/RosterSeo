import type { ZodType } from "zod";
import type { AgenticChatOptions, AgenticChatResult } from "./agentic";

// Provider abstraction that decouples "how we reach an AI surface" from
// "what we do with the answer" - every
// downstream feature (mention detection, citation extraction, fan-out analysis) consumes
// only ScrapeResult, never a provider-specific raw payload shape directly.

export type ProviderAccess = "scraped" | "api";

// url/domain/citationIndex are always populated; title is whatever the
// provider's own response supplies, if anything.
export interface Citation {
  url: string;
  title?: string;
  domain: string;
  citationIndex: number;
}

// Real token counts from the provider's own API response, when it
// supplies them - used by the shared spend-logging wrapper in
// providers/index.ts to estimate cost via a pricing table. Undefined for
// providers with no token concept (BrightData's scraped surfaces).
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

// The normalized shape every provider's run() returns, regardless of what
// its raw payload looked like.
export interface ScrapeResult {
  textContent: string;
  // Real web-search queries the provider issued while producing this
  // answer, or [WEB_QUERIES_UNAVAILABLE] when a search demonstrably
  // happened (citations exist) but the query strings weren't exposed, or
  // [] when no search happened / isn't applicable.
  webQueries: string[];
  citations: Citation[];
  modelVersion?: string;
  usage?: TokenUsage;
  // Real dollar cost from the provider's own response (currently only
  // OpenRouter, via `usage: { include: true }`) - when absent, the spend
  // wrapper estimates from `usage` x a pricing table instead.
  costUsd?: number;
  // The full raw provider payload (whatever the SDK/fetch call returned),
  // for debugging and for aiVisibilityResults.rawOutput. Best-effort: a
  // provider that fails to capture this stores undefined rather than
  // breaking the run. Never re-parsed downstream - every real field a
  // caller needs should already be on this ScrapeResult.
  rawOutput?: unknown;
}

export interface ProviderOptions {
  webSearch?: boolean;
  // For providers that front more than one underlying surface/model
  // (OpenRouter's model slug, BrightData's dataset id) - optional, provider
  // decides how to interpret it.
  version?: string;
  // Overrides the provider's hardcoded completion token budget (each
  // direct-API provider defaults to 1200 when this is omitted) - added
  // because llm-caller.ts's callProvider/callProviderRaw already accepted
  // a maxTokens parameter from their callers but never forwarded it here,
  // silently discarding every caller's real tuning choice.
  maxTokens?: number;
}

export interface StructuredResearchOptions<T> {
  prompt: string;
  // Input/Def positions loosened to `any` - a schema using .default(...)
  // has a real Input type distinct from its Output (T), and pinning
  // ZodType<T>'s implicit Input=T would make T un-inferable from a schema
  // like that (TS falls back to inferring the wrong, pre-default shape).
  schema: ZodType<T, any, any>;
  webSearch?: boolean;
  // Overrides the provider's default research model - only meaningful for a
  // provider that fronts more than one model (OpenRouter's model slug, e.g.
  // "google/gemini-2.5-flash"). Providers with a single fixed model (OpenAI,
  // Anthropic) ignore this.
  model?: string;
  // Overrides the provider's default completion token budget - only
  // meaningful for providers that read it (currently OpenRouter). Needed for
  // schemas heavier than the 2000-token default (e.g. Page Analyzer's
  // multi-list recommendation shape), which otherwise get truncated
  // mid-JSON and fail to parse.
  maxTokens?: number;
}

export interface StructuredResearchResult<T> {
  object: T;
  modelVersion?: string;
  usage?: TokenUsage;
  costUsd?: number;
}

export interface Provider {
  id: string;
  name: string;
  access: ProviderAccess;
  isConfigured(): boolean;
  run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
  // One-shot structured (schema-validated) output, optionally with web
  // search - only implemented by providers capable of it (direct-API
  // providers with a JSON-mode or equivalent). Used by onboarding research
  // and the Opportunities digest.
  runStructuredResearch?<T>(options: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>>;
  // Real multi-turn, tool-calling chat - only implemented by the 3
  // providers whose REST API actually supports function calling (openai,
  // anthropic, openrouter; see agentic.ts's header comment). Cappy
  // (apps/web/lib/cappy/agent-loop.ts) is the only caller.
  chat?(options: AgenticChatOptions): Promise<AgenticChatResult>;
}
