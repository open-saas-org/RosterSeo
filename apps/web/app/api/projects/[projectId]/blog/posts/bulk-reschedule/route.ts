import { NextResponse } from "next/server";
import { rescheduleBlogPost } from "@/lib/publish/reschedule-post";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string };

// POST body: { ids: string[]; scheduledFor: string } - the Posts
// workspace's bulk-select "Reschedule" action. Reuses rescheduleBlogPost
// per id (not a single bulk SQL update) because it's not a pure DB write -
// each post's queued pg-boss jobs need their own startAfter moved - and
// because one post being in the wrong status to reschedule shouldn't
// block the others in the same batch.
export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  const scheduledForRaw = typeof body?.scheduledFor === "string" ? body.scheduledFor : undefined;
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });
  if (!scheduledForRaw) return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });

  const scheduledFor = new Date(scheduledForRaw);
  if (Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: "Invalid scheduledFor date" }, { status: 400 });
  if (scheduledFor.getTime() <= Date.now()) return NextResponse.json({ error: "scheduledFor must be in the future" }, { status: 400 });

  const results = await Promise.allSettled(ids.map((id: string) => rescheduleBlogPost(session.user.id, projectId, id, scheduledFor)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason instanceof Error ? r.reason.message : "Couldn't reschedule"));

  return NextResponse.json({ succeeded, failed: ids.length - succeeded, errors });
});
