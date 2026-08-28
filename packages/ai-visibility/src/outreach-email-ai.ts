import { z } from "zod";
import { getProvider } from "./providers";

// Backlink Outreach's one structured AI call - drafts the initial email for
// one real outreach target. Same runStructuredResearch + zod + OpenRouter-only
// + retry pattern as page-analysis-ai.ts/visibility-opportunity.ts; see
// page-analysis-ai.ts's header comment for why OpenRouter-only (no
// direct-API fallback) and why "not_configured" is reported separately
// from "failed".

const outreachEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type OutreachEmailDraft = z.infer<typeof outreachEmailSchema>;

export interface OutreachEmailInput {
  yourDomain: string;
  yourProjectName: string;
  targetDomain: string;
  // The real page on the target's site this outreach relates to, if the
  // target was added from an existing backlink row - lets the draft
  // reference something real ("I saw your post at...") instead of writing
  // generically about the whole domain.
  targetPageUrl?: string;
}

const GUIDANCE = `You are drafting a single, genuine-sounding cold outreach email for real backlink/collaboration outreach - the kind a real small-business owner or SEO would actually write themselves, not a mass-blast template.

Rules:
- Short. 3-5 sentences in the body, not a sales pitch.
- Reference the real target site/page by name - never generic filler like "I came across your website."
- No spam-trigger language (no ALL CAPS words, no "FREE", "amazing offer", "act now", excessive exclamation points, excessive links).
- End with a real, low-pressure ask (e.g. a link addition, a guest post, a collaboration) and a one-line sign-off.
- Include a one-line opt-out note at the end of the body (e.g. "Let me know if you'd rather not hear from me again.").`;

function buildPrompt(input: OutreachEmailInput): string {
  return `${GUIDANCE}

Your project: ${input.yourProjectName} (${input.yourDomain})
Target site: ${input.targetDomain}
${input.targetPageUrl ? `Specific page this relates to: ${input.targetPageUrl}` : ""}

Return a JSON object with exactly these keys:
- subject: a short, real-sounding email subject line (not clickbait, not generic)
- body: the full email body as plain text (no HTML), following the rules above

Respond with ONLY a JSON object matching this shape, no markdown fences, no commentary.`;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_ATTEMPTS = 3;

export type OutreachEmailOutcome =
  | { status: "ok"; result: OutreachEmailDraft; model?: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export async function generateOutreachEmail(input: OutreachEmailInput): Promise<OutreachEmailOutcome> {
  const provider = getProvider("openrouter");
  if (!provider?.isConfigured() || !provider.runStructuredResearch) return { status: "not_configured" };

  const model = process.env.OUTREACH_OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(input);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object, modelVersion } = await provider.runStructuredResearch({
        prompt,
        schema: outreachEmailSchema,
        webSearch: false,
        model,
        maxTokens: 800,
      });
      return { status: "ok", result: object, model: modelVersion ?? model };
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`[ai-visibility] generateOutreachEmail via openrouter failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return { status: "failed", error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}
