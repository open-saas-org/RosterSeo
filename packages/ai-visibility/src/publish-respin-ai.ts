import { z } from "zod";
import { getProvider } from "./providers";

// Publish's one structured AI call - adapts ("respins") the canonical post
// for one target blogging platform. Same runStructuredResearch + zod +
// OpenRouter-only + retry pattern as outreach-email-ai.ts; see that file's
// header comment for why OpenRouter-only and why "not_configured" is
// reported separately from "failed".

const respinSchema = z.object({
  title: z.string(),
  body: z.string(),
});
export type BlogRespinResult = z.infer<typeof respinSchema>;

export interface BlogRespinInput {
  platform: string;
  sourceTitle: string;
  sourceBody: string; // Markdown
  projectDomain: string;
}

// Light per-platform flavor, not a full tone profile per platform - one
// prompt template with a short guidance line is enough for v1.
const PLATFORM_GUIDANCE: Record<string, string> = {
  devto: "Dev.to's audience is developers - keep a technical tone, preserve any code fences as-is, a punchy intro.",
  hashnode: "Hashnode's audience is developers - keep a technical tone, preserve any code fences as-is, favor a clear long-form structure.",
  tumblr: "Tumblr posts read shorter and more casual than a typical blog post - trim length, loosen the tone.",
};

function buildPrompt(input: BlogRespinInput): string {
  const guidance = PLATFORM_GUIDANCE[input.platform] ?? "Keep the same structure and meaning, only adjust length/tone modestly for this platform's typical readership.";
  return `You are adapting a blog post, already written, for a specific publishing platform - not writing it from scratch. Keep the same facts, structure, and Markdown formatting (headings, code fences, links) unless the platform guidance below says otherwise.

Platform: ${input.platform}
Platform guidance: ${guidance}

Source title: ${input.sourceTitle}
Source body (Markdown), from ${input.projectDomain}:
"""
${input.sourceBody}
"""

Return a JSON object with exactly these keys:
- title: the adapted title for this platform
- body: the adapted body as Markdown, following the platform guidance above

Respond with ONLY a JSON object matching this shape, no markdown fences, no commentary.`;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;

export type BlogRespinOutcome =
  | { status: "ok"; result: BlogRespinResult; model?: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function respinBlogPost(input: BlogRespinInput): Promise<BlogRespinOutcome> {
  const provider = getProvider("openrouter");
  if (!provider?.isConfigured() || !provider.runStructuredResearch) return { status: "not_configured" };

  const model = process.env.PUBLISH_OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(input);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object, modelVersion } = await provider.runStructuredResearch({
        prompt,
        schema: respinSchema,
        webSearch: false,
        model,
        maxTokens: 3000,
      });
      return { status: "ok", result: object, model: modelVersion ?? model };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[ai-visibility] respinBlogPost via openrouter failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return { status: "failed", error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}
