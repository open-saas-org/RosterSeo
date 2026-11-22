import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { rescheduleBlogPost } from "@/lib/publish/reschedule-post";

type RouteParams = { projectId: string; postId: string };

// GET - one post plus its per-platform targets, each joined with its
// connection's platform/label so the composer/detail view can render
// "Ghost - Main blog: published, https://..." without a second round trip.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [post] = await withUserContext(session.user.id, (tx) => tx.select().from(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, projectId))).limit(1));
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targets = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        id: blogPostTargets.id,
        blogPostId: blogPostTargets.blogPostId,
        blogConnectionId: blogPostTargets.blogConnectionId,
        adaptedTitle: blogPostTargets.adaptedTitle,
        adaptedBody: blogPostTargets.adaptedBody,
        status: blogPostTargets.status,
        remotePostId: blogPostTargets.remotePostId,
        remoteUrl: blogPostTargets.remoteUrl,
        failureReason: blogPostTargets.failureReason,
        publishedAt: blogPostTargets.publishedAt,
        platform: blogConnections.platform,
        connectionLabel: blogConnections.label,
      })
      .from(blogPostTargets)
      .innerJoin(blogConnections, eq(blogPostTargets.blogConnectionId, blogConnections.id))
      .where(eq(blogPostTargets.blogPostId, postId)),
  );

  return NextResponse.json({ post, targets });
});

// DELETE - removes the post; its targets cascade-delete via the FK
// (onDelete: "cascade" on blog_post_targets.blog_post_id). Powers the
// Posts list's bulk-delete action.
export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.delete(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, projectId))).returning();
    return row;
  });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ post: deleted });
});

// PATCH body: { scheduledFor: string } - reschedules an already-`scheduled`
// post to a new time (Posts workspace's single-row "Reschedule" action).
// Rejects any other post status with a clear error rather than silently
// no-opping - see lib/publish/reschedule-post.ts for why this is a
// distinct, narrower operation than the first-publish POST .../publish
// route.
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
    const result = await rescheduleBlogPost(session.user.id, projectId, postId, scheduledFor);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reschedule that post." }, { status: 400 });
  }
});
