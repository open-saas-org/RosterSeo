import { desc, eq } from "drizzle-orm";
import { socialPosts, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { SocialPostsList } from "@/components/social/social-posts-list";
import type { SocialPostView } from "@/components/social/types";
import { getCurrentProject } from "@/lib/current-project";

export default async function SocialPostsPage() {
  const { session, project } = await getCurrentProject();

  const posts = await withUserContext(session.user.id, (tx) => tx.select().from(socialPosts).where(eq(socialPosts.projectId, project.id)).orderBy(desc(socialPosts.createdAt)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every social post you've composed - draft, scheduled, or published." />
      <SocialPostsList
        posts={posts.map((p) => ({
          ...p,
          status: p.status as SocialPostView["status"],
          scheduledFor: p.scheduledFor?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
