import { desc, eq } from "drizzle-orm";
import { blogPosts, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { PublishPostsList } from "@/components/publish/publish-posts-list";
import type { BlogPostView } from "@/components/publish/types";
import { getCurrentProject } from "@/lib/current-project";

export default async function PublishPostsPage() {
  const { session, project } = await getCurrentProject();

  const posts = await withUserContext(session.user.id, (tx) => tx.select().from(blogPosts).where(eq(blogPosts.projectId, project.id)).orderBy(desc(blogPosts.createdAt)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every post you've composed - draft, scheduled, or published." />
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
