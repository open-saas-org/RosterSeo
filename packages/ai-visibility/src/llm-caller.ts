import { AI_VISIBILITY_PROVIDERS, type AiVisibilityProvider } from "./types";
import { getProvider } from "./providers";

// Thin compatibility shim over packages/ai-visibility/src/providers/ (the
// new multi-provider registry - see providers/index.ts) for callers that
// only need a freeform text answer from one of the 4 original direct-API
// providers and don't care about the richer Provider/ScrapeResult shape:
// page-guidance.ts, local-seo-guidance.ts, local-seo-strategy.ts.
// client.ts's entity-mention sampling talks to the provider registry
// directly instead (see Phase D), since it needs the full ScrapeResult.

export function isProviderConfigured(provider: AiVisibilityProvider): boolean {
  return getProvider(provider)?.isConfigured() ?? false;
}

export function isAnyProviderConfigured(): boolean {
  return AI_VISIBILITY_PROVIDERS.some((provider) => isProviderConfigured(provider));
}

// First configured provider, in a fixed preference order.
export function pickConfiguredProvider(): AiVisibilityProvider | undefined {
  return AI_VISIBILITY_PROVIDERS.find((provider) => isProviderConfigured(provider));
}

export interface RawProviderResponse {
  text: string;
  // Real cited source URLs, only when the provider's API actually returns
  // them - null otherwise. Never fabricated for providers that don't
  // supply grounding/citation data in their plain chat-completion response.
  citations: string[] | null;
  // The full raw provider payload (ScrapeResult.rawOutput), when the
  // provider captured one - best-effort, null otherwise. None of this
  // shim's current callers (page-guidance.ts, local-seo-guidance.ts,
  // local-seo-strategy.ts) persist it today, but it's threaded through here
  // too so a future caller doesn't have to re-derive it.
  rawOutput: unknown;
}

export async function callProviderRaw(provider: AiVisibilityProvider, prompt: string, maxTokens = 1200): Promise<RawProviderResponse> {
  const impl = getProvider(provider);
  if (!impl) throw new Error(`Unknown AI Visibility provider: ${provider}`);
  const result = await impl.run(provider, prompt, { maxTokens });
  return {
    text: result.textContent,
    citations: result.citations.length > 0 ? result.citations.map((c) => c.url) : null,
    rawOutput: result.rawOutput ?? null,
  };
}

// Thin text-only wrapper for callers that don't need citations
// (page-guidance.ts, local-seo-guidance.ts, local-seo-strategy.ts).
export async function callProvider(provider: AiVisibilityProvider, prompt: string, maxTokens = 1200): Promise<string> {
  return (await callProviderRaw(provider, prompt, maxTokens)).text;
}
