import { desc, eq, inArray } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { PublishPostsList } from "@/components/publish/publish-posts-list";
import { UpNext } from "@/components/posts/up-next";
import type { BlogPostView } from "@/components/publish/types";
import { getCurrentProject } from "@/lib/current-project";
import { getUpcomingPosts } from "@/lib/posts/upcoming";

export default async function PublishPostsPage() {
  const { session, project } = await getCurrentProject();

  const [posts, upcoming] = await Promise.all([
    withUserContext(session.user.id, (tx) => tx.select().from(blogPosts).where(eq(blogPosts.projectId, project.id)).orderBy(desc(blogPosts.createdAt))),
    getUpcomingPosts(session.user.id, project.id),
  ]);

  // One extra grouped query for every post's distinct target platforms
  // (for the list's per-row platform badges + client-side platform
  // filter) rather than N+1 per-post lookups - see BlogPostView.platforms.
  const postIds = posts.map((p) => p.id);
  const platformsByPost = new Map<string, Set<string>>();
  if (postIds.length > 0) {
    const targetPlatforms = await withUserContext(session.user.id, (tx) =>
      tx
        .select({ blogPostId: blogPostTargets.blogPostId, platform: blogConnections.platform })
        .from(blogPostTargets)
        .innerJoin(blogConnections, eq(blogPostTargets.blogConnectionId, blogConnections.id))
        .where(inArray(blogPostTargets.blogPostId, postIds)),
    );
    for (const row of targetPlatforms) {
      const set = platformsByPost.get(row.blogPostId) ?? new Set<string>();
      set.add(row.platform);
      platformsByPost.set(row.blogPostId, set);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every post you've composed - draft, scheduled, or published." />
      <UpNext events={upcoming} />
      <PublishPostsList
        projectId={project.id}
        posts={posts.map((p) => ({
          ...p,
          status: p.status as BlogPostView["status"],
          scheduledFor: p.scheduledFor?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          platforms: Array.from(platformsByPost.get(p.id) ?? []),
        }))}
      />
    </div>
  );
}
