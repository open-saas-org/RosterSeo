import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { SocialPostReview } from "@/components/social/social-post-review";
import type { SocialPostTargetView, SocialPostView } from "@/components/social/types";
import { getCurrentProject } from "@/lib/current-project";

export default async function SocialPostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const { session, project } = await getCurrentProject();

  const [post] = await withUserContext(session.user.id, (tx) => tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, project.id))).limit(1));
  if (!post) notFound();

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Review & post" description="AI-adapt each platform's version (character-limit aware), edit anything you like, then post now or schedule." />
      <SocialPostReview
        projectId={project.id}
        post={{
          ...post,
          status: post.status as SocialPostView["status"],
          scheduledFor: post.scheduledFor?.toISOString() ?? null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        }}
        initialTargets={targets.map((t) => ({ ...t, status: t.status as SocialPostTargetView["status"], publishedAt: t.publishedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
