import type { Provider } from "./types";
import { openaiApi } from "./registry/openai-api";
import { anthropicApi } from "./registry/anthropic-api";
import { googleApi } from "./registry/google-api";
import { perplexityApi } from "./registry/perplexity-api";
import { openrouter } from "./registry/openrouter";
import { brightdata } from "./registry/brightdata";
import { recordAiVisibilitySpend, resolveSpendUsd } from "./spend";

export * from "./types";
export * from "./constants";
export * from "./spend";
export { listOpenRouterModels, type OpenRouterModel } from "./registry/openrouter";
export * from "./agentic";
export { openaiApi, anthropicApi, googleApi, perplexityApi, openrouter, brightdata };

const providerMap: Record<string, Provider> = {
  openai: openaiApi,
  anthropic: anthropicApi,
  google: googleApi,
  perplexity: perplexityApi,
  openrouter,
  brightdata,
};

// Wraps every provider's real call methods with spend logging in one place
// - callers (visibility sampling, opportunities/onboarding structured
// research, Page Analyzer's AI guidance, local-seo guidance) all reach a
// provider through getProvider(), so this single wrapper catches every real
// call site without each caller needing to remember to log spend itself.
function withSpendLogging(provider: Provider): Provider {
  return {
    ...provider,
    async run(model, prompt, options) {
      const result = await provider.run(model, prompt, options);
      const { costUsd, isEstimate } = resolveSpendUsd(provider.id, result.modelVersion ?? model, result.usage, result.costUsd);
      recordAiVisibilitySpend({ provider: provider.id, operation: "sample", model: result.modelVersion ?? model, costUsd, isEstimate, usage: result.usage });
      return result;
    },
    runStructuredResearch: provider.runStructuredResearch
      ? async (options) => {
          const result = await provider.runStructuredResearch!(options);
          const { costUsd, isEstimate } = resolveSpendUsd(provider.id, result.modelVersion ?? options.model, result.usage, result.costUsd);
          recordAiVisibilitySpend({
            provider: provider.id,
            operation: "structured_research",
            model: result.modelVersion ?? options.model,
            costUsd,
            isEstimate,
            usage: result.usage,
          });
          return result;
        }
      : undefined,
    chat: provider.chat
      ? async (options) => {
          const result = await provider.chat!(options);
          const { costUsd, isEstimate } = resolveSpendUsd(provider.id, result.modelVersion ?? options.model, result.usage, result.costUsd);
          recordAiVisibilitySpend({ provider: provider.id, operation: "chat", model: result.modelVersion ?? options.model, costUsd, isEstimate, usage: result.usage });
          return result;
        }
      : undefined,
  };
}

export function getProvider(id: string): Provider | undefined {
  const provider = providerMap[id];
  return provider ? withSpendLogging(provider) : undefined;
}

export function getAllProviders(): Provider[] {
  return Object.values(providerMap);
}

export function getAvailableProviders(): Provider[] {
  return getAllProviders().filter((p) => p.isConfigured());
}

// The 4 direct-API providers this project sampled from before this
// rebuild - the default target set for a project with no explicit
// `aiVisibilityTargets` configured (Phase B/D), preserving today's
// behavior for every existing project.
export const DEFAULT_DIRECT_API_PROVIDER_IDS = ["openai", "anthropic", "google", "perplexity"] as const;
