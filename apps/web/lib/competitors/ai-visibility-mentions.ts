import { and, eq, gte, inArray } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, withUserContext } from "@rosterseo/db";
import { calculateVisibilityScore } from "@rosterseo/ai-visibility";

// Same lookback window as the dashboard's own AI Visibility card.
const AI_VISIBILITY_WINDOW_DAYS = 28;

// Real per-competitor AI Visibility mention rate, keyed by domain - shared
// by the Competitors detail page so it doesn't need its own copy of this
// query. A domain missing from the returned map means "never sampled" (no
// prompts run yet, or this competitor was added after the last run) - the
// caller should omit the card rather than showing a fabricated 0%.
export async function getAiVisibilityByDomain(userId: string, projectId: string): Promise<Record<string, number>> {
  return withUserContext(userId, async (tx) => {
    const prompts = await tx.select({ id: aiVisibilityPrompts.id }).from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, projectId));
    if (prompts.length === 0) return {};

    const cutoff = new Date(Date.now() - AI_VISIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const results = await tx
      .select({ entityDomain: aiVisibilityResults.entityDomain, mentioned: aiVisibilityResults.mentioned })
      .from(aiVisibilityResults)
      .where(and(inArray(aiVisibilityResults.promptId, prompts.map((p) => p.id)), gte(aiVisibilityResults.runAt, cutoff)));

    const byDomain = new Map<string, Array<{ mentioned: boolean }>>();
    for (const r of results) {
      if (!r.entityDomain) continue; // null = the brand's own row, not a competitor
      const list = byDomain.get(r.entityDomain) ?? [];
      list.push({ mentioned: r.mentioned });
      byDomain.set(r.entityDomain, list);
    }

    const out: Record<string, number> = {};
    for (const [domain, samples] of byDomain) out[domain] = calculateVisibilityScore(samples);
    return out;
  });
}
