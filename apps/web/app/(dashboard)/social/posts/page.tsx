import { desc, eq } from "drizzle-orm";
import { socialPosts, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { SocialPostsList } from "@/components/social/social-posts-list";
import { UpNext } from "@/components/posts/up-next";
import type { SocialPostView } from "@/components/social/types";
import { getCurrentProject } from "@/lib/current-project";
import { getUpcomingPosts } from "@/lib/posts/upcoming";

export default async function SocialPostsPage() {
  const { session, project } = await getCurrentProject();

  const [posts, upcoming] = await Promise.all([
    withUserContext(session.user.id, (tx) => tx.select().from(socialPosts).where(eq(socialPosts.projectId, project.id)).orderBy(desc(socialPosts.createdAt))),
    getUpcomingPosts(session.user.id, project.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every social post you've composed - draft, scheduled, or published." />
      <UpNext events={upcoming} />
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
