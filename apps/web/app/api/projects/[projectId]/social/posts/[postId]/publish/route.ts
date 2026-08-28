import { NextResponse } from "next/server";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { scheduleSocialPost } from "@/lib/social/schedule-post";

type RouteParams = { projectId: string; postId: string };

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const scheduledForRaw = typeof body?.scheduledFor === "string" ? body.scheduledFor : undefined;
  let scheduledFor: Date | undefined;
  if (scheduledForRaw) {
    scheduledFor = new Date(scheduledForRaw);
    if (Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: "Invalid scheduledFor date" }, { status: 400 });
    if (scheduledFor.getTime() <= Date.now()) return NextResponse.json({ error: "scheduledFor must be in the future" }, { status: 400 });
  }

  try {
    const result = await scheduleSocialPost(session.user.id, projectId, postId, scheduledFor);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't publish that post." }, { status: 400 });
  }
});
