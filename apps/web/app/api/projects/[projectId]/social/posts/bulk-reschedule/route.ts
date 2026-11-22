import { NextResponse } from "next/server";
import { rescheduleSocialPost } from "@/lib/social/reschedule-post";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string };

// See the blog equivalent route's identical comment.
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

  const results = await Promise.allSettled(ids.map((id: string) => rescheduleSocialPost(session.user.id, projectId, id, scheduledFor)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason instanceof Error ? r.reason.message : "Couldn't reschedule"));

  return NextResponse.json({ succeeded, failed: ids.length - succeeded, errors });
});
