import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { socialPostMetrics, socialPostTargets, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; postId: string };

// GET - every real metrics snapshot ever fetched for this post's targets
// (apps/worker's socialMetricsFetchJob, see PUBLISHING_PLATFORM_PRD.md §3),
// newest first. Read-only; never triggers a live fetch itself (that's the
// worker's job, on its own daily schedule) - powers the per-post
// performance section in PostsInspector.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targets = await withUserContext(session.user.id, (tx) =>
    tx.select({ id: socialPostTargets.id }).from(socialPostTargets).where(eq(socialPostTargets.socialPostId, postId)),
  );
  const targetIds = new Set(targets.map((t) => t.id));

  const rows = await withUserContext(session.user.id, (tx) =>
    tx.select().from(socialPostMetrics).where(eq(socialPostMetrics.projectId, projectId)),
  );

  const metrics = rows.filter((row) => targetIds.has(row.socialPostTargetId)).sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());

  return NextResponse.json({ metrics });
});
