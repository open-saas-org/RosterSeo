import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { localSeoRecommendations, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// PATCH /api/projects/:projectId/local-seo/optimize/:recommendationId
// Body: { status: "todo" | "done" }. Toggles one checklist item.

type RouteParams = { projectId: string; recommendationId: string };

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, recommendationId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "todo" && status !== "done") {
    return NextResponse.json({ error: "status must be 'todo' or 'done'" }, { status: 400 });
  }

  const [row] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(localSeoRecommendations)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(localSeoRecommendations.id, recommendationId), eq(localSeoRecommendations.projectId, projectId)))
      .returning(),
  );

  if (!row) {
    return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  }

  return NextResponse.json({ recommendation: row });
});
