import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

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

  return NextResponse.json({ post, targets });
});
