// Which providers Clay can actually use - the only 3 with real tool-calling
// support (see packages/ai-visibility/src/providers/agentic.ts).
export const CLAY_PROVIDER_IDS = ["openai", "anthropic", "openrouter"] as const;
export type ClayProviderId = (typeof CLAY_PROVIDER_IDS)[number];

const DEFAULT_PROVIDER: ClayProviderId = "openrouter";

const DEFAULT_MODEL_FOR: Record<ClayProviderId, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  openrouter: "openai/gpt-5-mini",
};

export function resolveClayProvider(stored: string | null | undefined): ClayProviderId {
  return CLAY_PROVIDER_IDS.includes(stored as ClayProviderId) ? (stored as ClayProviderId) : DEFAULT_PROVIDER;
}

export function resolveClayModel(stored: string | null | undefined, provider: ClayProviderId): string {
  return stored?.trim() || DEFAULT_MODEL_FOR[provider];
}
