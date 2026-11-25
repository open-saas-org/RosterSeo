"use server";

import { headers } from "next/headers";
import {
  AI_VISIBILITY_PROVIDERS,
  samplePrompt,
  type AiVisibilityProvider,
  type PromptSampleResult,
} from "@rosterseo/ai-visibility";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { checkAndIncrementUsage } from "@/lib/usage";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Not signed in.");
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const brand = input.brand.trim();
  if (!brand) {
    throw new Error("Enter a brand name or domain to check.");
  }

  const usage = await checkAndIncrementUsage(org.id, "ai_visibility_prompts", session.user.id);
  if (!usage.allowed) {
    throw new Error(`Monthly AI Visibility limit reached (${usage.used}/${usage.limit}). Upgrade your plan to run more checks.`);
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
