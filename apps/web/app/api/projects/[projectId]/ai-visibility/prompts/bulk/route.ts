import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { aiVisibilityPrompts, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { MAX_PROMPTS } from "@/lib/ai-visibility/track-prompt";

// POST /api/projects/:projectId/ai-visibility/prompts/bulk - real batch
// insert behind the Prompts page's "Add Multiple" textarea. Replaces the
// old client-side "one POST per line" approach: trims every line, dedupes
// against both the other lines in the same submission and the project's
// already-tracked prompts, inserts everything new in a single query, and
// reports exactly which lines were skipped and why (empty / duplicate /
// the project's MAX_PROMPTS cap) instead of one generic failure message.

type RouteParams = { projectId: string };

type SkipReason = "empty" | "duplicate" | "cap";
type SkippedLine = { text: string; reason: SkipReason };

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.prompts) || !body.prompts.every((p: unknown) => typeof p === "string")) {
    return NextResponse.json({ error: "prompts must be an array of strings" }, { status: 400 });
  }

  const rawLines: string[] = body.prompts;
  if (rawLines.length === 0) {
    return NextResponse.json({ error: "prompts must include at least one line" }, { status: 400 });
  }

  const skipped: SkippedLine[] = [];
  // text -> normalized key, in submission order, so "added" preserves the
  // order the user typed them in.
  const seenInSubmission = new Set<string>();
  const candidates: string[] = [];

  for (const raw of rawLines) {
    const text = raw.trim();
    if (!text) {
      skipped.push({ text: raw, reason: "empty" });
      continue;
    }
    const key = text.toLowerCase();
    if (seenInSubmission.has(key)) {
      skipped.push({ text, reason: "duplicate" });
      continue;
    }
    seenInSubmission.add(key);
    candidates.push(text);
  }

  const { added, skippedFromDb, skippedFromCap } = await withUserContext(session.user.id, async (tx) => {
    if (candidates.length === 0) {
      return { added: [] as (typeof aiVisibilityPrompts.$inferSelect)[], skippedFromDb: [] as string[], skippedFromCap: [] as string[] };
    }

    const existingRows = await tx
      .select({ promptText: aiVisibilityPrompts.promptText })
      .from(aiVisibilityPrompts)
      .where(eq(aiVisibilityPrompts.projectId, projectId));
    const existingKeys = new Set(existingRows.map((r) => r.promptText.trim().toLowerCase()));

    const skippedFromDb: string[] = [];
    const notAlreadyTracked = candidates.filter((text) => {
      if (existingKeys.has(text.toLowerCase())) {
        skippedFromDb.push(text);
        return false;
      }
      return true;
    });

    const room = Math.max(0, MAX_PROMPTS - existingRows.length);
    const toInsert = notAlreadyTracked.slice(0, room);
    const skippedFromCap = notAlreadyTracked.slice(room);

    const added = toInsert.length > 0 ? await tx.insert(aiVisibilityPrompts).values(toInsert.map((promptText) => ({ projectId, promptText }))).returning() : [];

    return { added, skippedFromDb, skippedFromCap };
  });

  for (const text of skippedFromDb) skipped.push({ text, reason: "duplicate" });
  for (const text of skippedFromCap) skipped.push({ text, reason: "cap" });

  return NextResponse.json({ added: added.length, prompts: added, skipped }, { status: 201 });
});
