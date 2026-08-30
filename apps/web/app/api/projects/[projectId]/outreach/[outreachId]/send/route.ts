import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { outreachTargets, withUserContext } from "@rosterseo/db";
import { outreachSendJob } from "@rosterseo/jobs";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; outreachId: string };

// POST - enqueues the real send job (apps/worker's outreach-runner.ts),
// which does the actual pacing/cap check and delivery - never sends
// inline from this route. Validates the obvious blockers up front (no
// recipient/draft/connection) so the UI gets a real error immediately
// instead of a job that's guaranteed to fail a moment later.
export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, outreachId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [target] = await withUserContext(session.user.id, (tx) =>
    tx.select().from(outreachTargets).where(and(eq(outreachTargets.id, outreachId), eq(outreachTargets.projectId, projectId))).limit(1),
  );
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target.contactEmail) return NextResponse.json({ error: "No recipient email set for this target." }, { status: 400 });
  if (!target.subject || !target.body) return NextResponse.json({ error: "Generate or write a draft before sending." }, { status: 400 });
  if (!target.emailConnectionId) return NextResponse.json({ error: "Pick which connected email to send from first." }, { status: 400 });

  await withUserContext(session.user.id, (tx) => tx.update(outreachTargets).set({ status: "queued", failureReason: null }).where(eq(outreachTargets.id, outreachId)));

  await outreachSendJob.enqueue({ outreachTargetId: outreachId, projectId, userId: session.user.id });

  return NextResponse.json({ ok: true, status: "queued" });
});
