import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { keywordRankings, rankCheckRuns, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/rank-tracking/trend?days=30|90|all - the
// data behind the position-distribution stacked chart: one point per real
// completed Fetch Rankings run, bucketed by position. Only rows with a
// non-null runId count (one-off single-keyword "check now" calls are
// excluded, same reasoning as the schema's runId comment - a single
// re-check shouldn't skew the portfolio-wide trend).

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const daysParam = new URL(req.url).searchParams.get("days") ?? "90";
  const days = daysParam === "all" ? null : Number(daysParam);

  const points = await withUserContext(session.user.id, async (tx) => {
    const runFilters = [eq(rankCheckRuns.projectId, projectId), eq(rankCheckRuns.status, "completed")];
    if (days && Number.isFinite(days)) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      runFilters.push(gte(rankCheckRuns.startedAt, cutoff));
    }

    const runs = await tx
      .select({ id: rankCheckRuns.id, startedAt: rankCheckRuns.startedAt })
      .from(rankCheckRuns)
      .where(and(...runFilters))
      .orderBy(asc(rankCheckRuns.startedAt));

    if (runs.length === 0) return [];

    const rows = await tx
      .select({ runId: keywordRankings.runId, position: keywordRankings.position })
      .from(keywordRankings)
      .where(
        inArray(
          keywordRankings.runId,
          runs.map((r) => r.id),
        ),
      );

    const byRun = new Map<string, { top3: number; top4to10: number; top11to20: number; notRanking: number }>();
    for (const run of runs) byRun.set(run.id, { top3: 0, top4to10: 0, top11to20: 0, notRanking: 0 });

    for (const row of rows) {
      if (!row.runId) continue;
      const bucket = byRun.get(row.runId);
      if (!bucket) continue;
      const pos = row.position;
      if (pos === null) bucket.notRanking += 1;
      else if (pos <= 3) bucket.top3 += 1;
      else if (pos <= 10) bucket.top4to10 += 1;
      else if (pos <= 20) bucket.top11to20 += 1;
      else bucket.notRanking += 1;
    }

    return runs.map((run) => ({ runId: run.id, startedAt: run.startedAt.toISOString(), ...byRun.get(run.id)! }));
  });

  return NextResponse.json({ points });
});
