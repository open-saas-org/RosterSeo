"use server";

import {
  AI_VISIBILITY_PROVIDERS,
  samplePrompt,
  type AiVisibilityProvider,
  type PromptSampleResult,
} from "@rosterseo/ai-visibility";

// Brand Lookup is a one-off, ad-hoc check - distinct from AI Visibility's
// ongoing tracked-prompt monitoring (apps/web/app/(dashboard)/ai-visibility/).
// It draws exactly one sample per provider (sampleIndex 0) instead of
// runVisibilityCheck()'s multi-sample fan-out, since there's no "mention
// rate over several draws" here - just "what does each provider say about
// this brand right now." Real-only: `result` is `null` when that provider
// isn't configured or the real call failed - never a fabricated verdict.
export type BrandLookupProviderResult = {
  provider: AiVisibilityProvider;
  result: PromptSampleResult | null;
};

export type BrandLookupResult = {
  brand: string;
  promptText: string;
  checkedAt: string;
  providerResults: BrandLookupProviderResult[];
};

function defaultPromptText(brand: string) {
  return `What do you know about ${brand}? Would you recommend it, and why?`;
}

export async function lookupBrandAction(input: {
  brand: string;
  question?: string;
}): Promise<BrandLookupResult> {
  const brand = input.brand.trim();
  if (!brand) {
    throw new Error("Enter a brand name or domain to check.");
  }
  const promptText = input.question?.trim() || defaultPromptText(brand);

  const providerResults = await Promise.all(
    AI_VISIBILITY_PROVIDERS.map(async (provider) => ({
      provider,
      result: await samplePrompt(promptText, brand, provider, 0),
    })),
  );

  return {
    brand,
    promptText,
    checkedAt: new Date().toISOString(),
    providerResults,
  };
}
