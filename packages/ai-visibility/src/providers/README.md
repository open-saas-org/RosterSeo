# AI Visibility providers

Six real providers, one shared `Provider` interface (`types.ts`), registered in
`index.ts`'s `providerMap`. Each one answers the same question - "what does
this AI surface say when asked a tracked prompt?" - but reaches the model
through one of three different access paths:

| Access | Providers | How it works |
|---|---|---|
| **Direct API** (`access: "api"`) | `openai`, `anthropic`, `google`, `perplexity`, `openrouter` | A real chat-completion API call straight to the provider (or, for `openrouter`, a pass-through gateway to any OpenRouter-hosted model via one key). Configured via that provider's own API key env var. |
| **Scraped** (`access: "scraped"`) | `brightdata` | Real browser-automation scraping of the actual consumer UI (chatgpt.com, gemini.google.com, perplexity.ai, copilot) via BrightData's async dataset-collector trigger/poll/fetch lifecycle, plus a separate SERP call for Google's AI Overview. This is the only way to sample what a *logged-out consumer* sees on these surfaces - the direct APIs above answer as the API product, not the consumer chat UI, and those can genuinely differ. |

`brightdata` is a single registry entry that fronts **five** distinct AI
surfaces (`chatgpt`, `gemini`, `perplexity`, `copilot`, `google-ai-overview`)
sharing `provider: "brightdata"` but differing by the real `model` value -
any code that needs to isolate one of these five must group/filter by
`model` (or `model ?? provider`), never by `provider` alone. See
`ai-visibility-prompts-workspace.tsx`, the Visibility/Share-of-Voice/Citations/
Query-Fan-Out pages, and `getModelDisplayLabel(provider, model)` for the
established pattern.

Each provider implements `run(model, prompt, options?)` for a single sample,
and the 3 providers that support it also implement
`runStructuredResearch<T>({ prompt, schema, webSearch, model, maxTokens })`
for a schema-validated JSON response (used by `visibility-opportunity.ts`,
`onboarding-research.ts`, and Page Analyzer's structured guidance call) -
`anthropic`, `openai`, and `openrouter` only; `google`, `perplexity`, and
`brightdata` don't.

Request timeouts are shared, named constants in `constants.ts`
(`PLAIN_SAMPLE_TIMEOUT_MS`, `WEB_SEARCH_SAMPLE_TIMEOUT_MS`,
`STRUCTURED_RESEARCH_TIMEOUT_MS`) rather than per-file magic numbers - see
that file's own comment for why each value differs.

A 4th capability, `chat({ model, systemPrompt, messages, tools, maxTokens })`
(defined in `agentic.ts`), is real multi-turn tool-calling - the only
providers whose REST API actually supports function calling: `openai`,
`anthropic`, `openrouter`. `google`, `perplexity`, and `brightdata` don't
implement it. This is Cappy's (the in-app AI assistant,
`apps/web/lib/cappy/*`) one and only entry point into this package - `run`/
`runStructuredResearch` are single-shot, `chat` is the real agent loop.
`agentic.ts` also holds the format converters between Cappy's
provider-agnostic `AgenticMessage[]`/`CappyToolDef[]` shapes and each
provider's real wire format - OpenAI and OpenRouter share one identical
`tools`/`tool_calls` shape (`toOpenAiCompatibleTools`/`Messages`), Anthropic
has its own distinct `tool_use`/`tool_result` block format
(`toAnthropicTools`/`Messages`). Like every other capability here, `chat`
is wrapped in `withSpendLogging()` in `index.ts` - real cost (OpenRouter) or
a token-based estimate (openai/anthropic) lands in `provider_spend_log`
with `operation: "chat"`, same as every other real call.
