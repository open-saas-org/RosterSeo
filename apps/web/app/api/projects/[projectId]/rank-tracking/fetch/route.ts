import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { rankCheckJob } from "@rosterseo/jobs";
import { rankCheckRuns, trackedKeywords, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/rank-tracking/fetch - the only route that
// triggers a real DataForSEO call for the rank tracker. Body:
// { keywordIds?: string[] } - omitted/empty means "all tracked keywords".
// Creates a real rank_check_runs row and enqueues rankCheckJob
// (apps/worker) to do the actual checking in the background - this route
// returns immediately with a runId to poll, it never calls DataForSEO
// itself. Guards against starting a second run while one is already
// pending/running for this project.

type RouteParams = { projectId: string };

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const requestedIds: string[] = Array.isArray(body?.keywordIds) ? body.keywordIds.filter((id: unknown) => typeof id === "string") : [];

  const result = await withUserContext(session.user.id, async (tx) => {
    const [activeRun] = await tx
      .select({ id: rankCheckRuns.id })
      .from(rankCheckRuns)
      .where(and(eq(rankCheckRuns.projectId, projectId), or(eq(rankCheckRuns.status, "pending"), eq(rankCheckRuns.status, "running"))))
      .limit(1);
    if (activeRun) return { error: "run_in_progress" as const };

    const keywordRows =
      requestedIds.length > 0
        ? await tx
            .select({ id: trackedKeywords.id })
            .from(trackedKeywords)
            .where(and(eq(trackedKeywords.projectId, projectId), inArray(trackedKeywords.id, requestedIds)))
        : await tx.select({ id: trackedKeywords.id }).from(trackedKeywords).where(eq(trackedKeywords.projectId, projectId));

    if (keywordRows.length === 0) return { error: "no_keywords" as const };

    const keywordIds = keywordRows.map((r) => r.id);
    const [run] = await tx
      .insert(rankCheckRuns)
      .values({ projectId, keywordsTotal: keywordIds.length })
      .returning();

    return { run, keywordIds };
  });

  if ("error" in result) {
    if (result.error === "run_in_progress") {
      return NextResponse.json({ error: "run_in_progress" }, { status: 409 });
    }
    return NextResponse.json({ error: "no_keywords" }, { status: 400 });
  }

  await rankCheckJob.enqueue({ runId: result.run!.id, projectId, userId: session.user.id, keywordIds: result.keywordIds! });

  return NextResponse.json({ runId: result.run!.id });
});
