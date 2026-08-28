import { count, eq } from "drizzle-orm";
import { aiVisibilityPrompts, withUserContext } from "@seo-tool/db";

// Per-project cap on tracked prompts. Mirrors the order of magnitude of
// MAX_TRACKED_KEYWORDS (apps/web/app/api/projects/[projectId]/keywords/route.ts,
// 1000) but scaled down - each tracked prompt fans out to every enabled
// provider/model on every run, so the real cost/latency blast radius per
// prompt is much larger than one tracked keyword.
export const MAX_PROMPTS = 100;

// Real shared logic behind POST /api/projects/:projectId/ai-visibility -
// extracted so Clay's track_ai_visibility_prompt tool
// (apps/web/lib/clay/tools/write.ts) calls the exact same real insert the
// AI Visibility Prompts page already does.
export async function trackAiVisibilityPrompt(userId: string, projectId: string, rawPromptText: string) {
  const promptText = rawPromptText.trim();
  if (!promptText) throw new Error("promptText is required");

  return withUserContext(userId, async (tx) => {
    const [{ value: existingCount }] = await tx
      .select({ value: count() })
      .from(aiVisibilityPrompts)
      .where(eq(aiVisibilityPrompts.projectId, projectId));
    if (existingCount >= MAX_PROMPTS) {
      throw new Error(`This project is at its limit of ${MAX_PROMPTS} tracked prompts. Remove some before adding more.`);
    }

    const [row] = await tx.insert(aiVisibilityPrompts).values({ projectId, promptText }).returning();
    return row;
  });
}
