import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
import { SOCIAL_PLATFORMS } from "@rosterseo/social";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { rescheduleSocialPost } from "@/lib/social/reschedule-post";

type RouteParams = { projectId: string; postId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [post] = await withUserContext(session.user.id, (tx) => tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, projectId))).limit(1));
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targets = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        id: socialPostTargets.id,
        socialPostId: socialPostTargets.socialPostId,
        socialConnectionId: socialPostTargets.socialConnectionId,
        adaptedBody: socialPostTargets.adaptedBody,
        status: socialPostTargets.status,
        remotePostId: socialPostTargets.remotePostId,
        remoteUrl: socialPostTargets.remoteUrl,
        failureReason: socialPostTargets.failureReason,
        publishedAt: socialPostTargets.publishedAt,
        platform: socialConnections.platform,
        connectionLabel: socialConnections.label,
      })
      .from(socialPostTargets)
      .innerJoin(socialConnections, eq(socialPostTargets.socialConnectionId, socialConnections.id))
      .where(eq(socialPostTargets.socialPostId, postId)),
  );

  // Includes the full platform-definition list (plain data, no adapter
  // functions - see packages/social/src/types.ts's SocialPlatformDef) so
  // the Posts workspace's client-side Inspector sheet
  // (components/posts/posts-inspector.tsx) can render SocialPostReview
  // without importing @rosterseo/social itself - that package's registry
  // pulls in every adapter module, which isn't meant for a client bundle.
  return NextResponse.json({ post, targets, platforms: SOCIAL_PLATFORMS });
});

// DELETE - removes the post; its targets cascade-delete via the FK
// (onDelete: "cascade" on social_post_targets.social_post_id). Powers the
// Posts list's bulk-delete action.
export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.delete(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, projectId))).returning();
    return row;
  });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ post: deleted });
});

// PATCH body: { scheduledFor: string } - see the blog equivalent route's
// identical comment.
export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const scheduledForRaw = typeof body?.scheduledFor === "string" ? body.scheduledFor : undefined;
  if (!scheduledForRaw) return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });

  const scheduledFor = new Date(scheduledForRaw);
  if (Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: "Invalid scheduledFor date" }, { status: 400 });
  if (scheduledFor.getTime() <= Date.now()) return NextResponse.json({ error: "scheduledFor must be in the future" }, { status: 400 });

  try {
    const result = await rescheduleSocialPost(session.user.id, projectId, postId, scheduledFor);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reschedule that post." }, { status: 400 });
  }
});
