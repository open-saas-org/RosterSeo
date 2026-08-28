import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { PublishPostReview } from "@/components/publish/publish-post-review";
import type { BlogPostTargetView, BlogPostView } from "@/components/publish/types";
import { getCurrentProject } from "@/lib/current-project";

export default async function PublishPostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const { session, project } = await getCurrentProject();

  const [post] = await withUserContext(session.user.id, (tx) => tx.select().from(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, project.id))).limit(1));
  if (!post) notFound();

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Review & publish" description="AI-adapt each platform's version, edit anything you like, then publish now or schedule." />
      <PublishPostReview
        projectId={project.id}
        post={{
          ...post,
          status: post.status as BlogPostView["status"],
          scheduledFor: post.scheduledFor?.toISOString() ?? null,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        }}
        initialTargets={targets.map((t) => ({ ...t, status: t.status as BlogPostTargetView["status"], publishedAt: t.publishedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
