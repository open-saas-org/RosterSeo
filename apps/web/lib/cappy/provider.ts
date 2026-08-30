// Which providers Cappy can actually use - the only 3 with real tool-calling
// support (see packages/ai-visibility/src/providers/agentic.ts).
export const CAPPY_PROVIDER_IDS = ["openai", "anthropic", "openrouter"] as const;
export type CappyProviderId = (typeof CAPPY_PROVIDER_IDS)[number];

const DEFAULT_PROVIDER: CappyProviderId = "openrouter";

const DEFAULT_MODEL_FOR: Record<CappyProviderId, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  openrouter: "openai/gpt-5-mini",
};

export function resolveCappyProvider(stored: string | null | undefined): CappyProviderId {
  return CAPPY_PROVIDER_IDS.includes(stored as CappyProviderId) ? (stored as CappyProviderId) : DEFAULT_PROVIDER;
}

export function resolveCappyModel(stored: string | null | undefined, provider: CappyProviderId): string {
  return stored?.trim() || DEFAULT_MODEL_FOR[provider];
}
