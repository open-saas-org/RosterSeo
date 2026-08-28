import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

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
