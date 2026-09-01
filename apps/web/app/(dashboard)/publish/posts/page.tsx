import { desc, eq } from "drizzle-orm";
import { blogPosts, withUserContext } from "@rosterseo/db";
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every post you've composed - draft, scheduled, or published." />
      <UpNext events={upcoming} />
      <PublishPostsList
        posts={posts.map((p) => ({
          ...p,
          status: p.status as BlogPostView["status"],
          scheduledFor: p.scheduledFor?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
