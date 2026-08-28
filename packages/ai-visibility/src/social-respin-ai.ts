import { z } from "zod";
import { getProvider } from "./providers";

// Social's structured AI call - adapts ("respins") the canonical post for
// one target social platform, respecting that platform's real character
// limit. Same runStructuredResearch + zod + OpenRouter-only + retry
// pattern as publish-respin-ai.ts/outreach-email-ai.ts.

const respinSchema = z.object({
  text: z.string(),
});
export type SocialRespinResult = z.infer<typeof respinSchema>;

export interface SocialRespinInput {
  platform: string;
  sourceText: string;
  charLimit?: number;
  projectDomain: string;
}

function buildPrompt(input: SocialRespinInput): string {
  const limitLine = input.charLimit ? `Hard limit: ${input.charLimit} characters - the result MUST fit, no exceptions.` : "No hard character limit, but keep it as a real, short social update, not an essay.";
  return `You are adapting a short social media update, already written, for a specific platform - not writing it from scratch. Keep the same core message and tone.

Platform: ${input.platform}
${limitLine}

Source text, from ${input.projectDomain}:
"""
${input.sourceText}
"""

Return a JSON object with exactly one key:
- text: the adapted post text for this platform, following the limit above

Respond with ONLY a JSON object matching this shape, no markdown fences, no commentary.`;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;

export type SocialRespinOutcome =
  | { status: "ok"; result: SocialRespinResult; model?: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function respinSocialPost(input: SocialRespinInput): Promise<SocialRespinOutcome> {
  const provider = getProvider("openrouter");
  if (!provider?.isConfigured() || !provider.runStructuredResearch) return { status: "not_configured" };

  const model = process.env.SOCIAL_OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(input);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object, modelVersion } = await provider.runStructuredResearch({ prompt, schema: respinSchema, webSearch: false, model, maxTokens: 600 });
      if (input.charLimit && object.text.length > input.charLimit) {
        object.text = object.text.slice(0, input.charLimit);
      }
      return { status: "ok", result: object, model: modelVersion ?? model };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[ai-visibility] respinSocialPost via openrouter failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return { status: "failed", error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}
