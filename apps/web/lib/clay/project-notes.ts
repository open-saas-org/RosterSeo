import { desc, eq, sql } from "drizzle-orm";
import { clayMessages, clayProjectNotes, projects, withUserContext } from "@seo-tool/db";
import { getProvider } from "@seo-tool/ai-visibility";
import { resolveClayModel, resolveClayProvider } from "./provider";

// How often Clay's standing per-project memory (clay_project_notes) gets
// refreshed automatically - every N new messages logged for the project
// (across every thread, not just the one in progress), independent of the
// model's own update_project_notes tool calls (which refresh it
// immediately and reset this counter too, via the same insert path).
const CLAY_NOTES_REFRESH_THRESHOLD = 12;
const MAX_SUMMARY_CHARS = 4000;
const RECENT_MESSAGES_FOR_SUMMARY = 30;

// Fire-and-forget from the agent loop after a turn fully completes - a
// failed refresh here must never fail the real chat response the user is
// waiting on.
export async function maybeRefreshProjectNotes(userId: string, projectId: string): Promise<void> {
  const { totalMessages, notes } = await withUserContext(userId, async (tx) => {
    const [countRow] = await tx.select({ count: sql<number>`count(*)` }).from(clayMessages).where(eq(clayMessages.projectId, projectId));
    const [notesRow] = await tx.select().from(clayProjectNotes).where(eq(clayProjectNotes.projectId, projectId)).limit(1);
    return { totalMessages: Number(countRow?.count ?? 0), notes: notesRow ?? null };
  });

  const lastCount = notes?.messageCountAtLastRefresh ?? 0;
  if (totalMessages - lastCount < CLAY_NOTES_REFRESH_THRESHOLD) return;

  const [project, recentRows] = await withUserContext(userId, async (tx) => {
    const [projectRow] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const messageRows = await tx
      .select({ role: clayMessages.role, content: clayMessages.content })
      .from(clayMessages)
      .where(eq(clayMessages.projectId, projectId))
      .orderBy(desc(clayMessages.createdAt))
      .limit(RECENT_MESSAGES_FOR_SUMMARY);
    return [projectRow, messageRows.reverse()] as const;
  });
  if (!project) return;

  const provider = getProvider(resolveClayProvider(project.clayProvider));
  if (!provider?.isConfigured()) return;

  const transcript = recentRows
    .filter((r) => r.content)
    .map((r) => `${r.role}: ${r.content}`)
    .join("\n");
  if (!transcript.trim()) return;

  const prompt = `You maintain a short standing memory of real facts worth remembering about this SEO project, based on its assistant conversations. Update the summary below using the new conversation excerpt - keep it factual (real preferences, constraints, goals, decisions), drop anything no longer relevant, and keep the whole thing under ${MAX_SUMMARY_CHARS} characters. Respond with ONLY the updated summary text, no preamble, no markdown headers.

Existing summary:
${notes?.summary || "(none yet)"}

Recent conversation:
${transcript}`;

  let summary: string;
  try {
    summary = (await provider.run(resolveClayModel(project.clayModel, resolveClayProvider(project.clayProvider)), prompt, { maxTokens: 800 })).textContent.trim();
  } catch (err) {
    console.error(`[clay] project-notes refresh failed for project ${projectId}`, err);
    return;
  }
  if (!summary) return;

  await withUserContext(userId, (tx) =>
    tx
      .insert(clayProjectNotes)
      .values({ projectId, summary: summary.slice(0, MAX_SUMMARY_CHARS), messageCountAtLastRefresh: totalMessages, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: clayProjectNotes.projectId,
        set: { summary: summary.slice(0, MAX_SUMMARY_CHARS), messageCountAtLastRefresh: totalMessages, updatedAt: new Date() },
      }),
  );
}
