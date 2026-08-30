import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { trackedKeywords, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// DELETE /api/projects/:projectId/keywords/:keywordId - untrack a keyword.
// keyword_rankings rows cascade-delete via the FK on tracked_keywords.id.

type RouteParams = { projectId: string; keywordId: string };

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, keywordId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await withUserContext(session.user.id, async (tx) => {
    await tx
      .delete(trackedKeywords)
      .where(and(eq(trackedKeywords.id, keywordId), eq(trackedKeywords.projectId, projectId)));
  });

  return NextResponse.json({ ok: true });
});
