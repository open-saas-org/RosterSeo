import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { rankCheckRuns, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/rank-tracking/runs/:runId/progress - what
// RankTrackingTable polls (React Query refetchInterval) while a Fetch
// Rankings run is pending/running, same auth pattern as Site Audit's
// progress route but its own flatter response shape.

type RouteParams = { projectId: string; runId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, runId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const run = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(rankCheckRuns).where(eq(rankCheckRuns.id, runId)).limit(1);
    if (!row || row.projectId !== projectId) return null;
    return row;
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: run.status,
    keywordsTotal: run.keywordsTotal,
    keywordsChecked: run.keywordsChecked,
    errorMessage: run.errorMessage,
  });
});
