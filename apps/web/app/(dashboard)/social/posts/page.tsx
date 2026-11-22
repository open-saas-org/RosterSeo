import { desc, eq, inArray } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
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

  // See the Publish Posts page's identical comment.
  const postIds = posts.map((p) => p.id);
  const platformsByPost = new Map<string, Set<string>>();
  if (postIds.length > 0) {
    const targetPlatforms = await withUserContext(session.user.id, (tx) =>
      tx
        .select({ socialPostId: socialPostTargets.socialPostId, platform: socialConnections.platform })
        .from(socialPostTargets)
        .innerJoin(socialConnections, eq(socialPostTargets.socialConnectionId, socialConnections.id))
        .where(inArray(socialPostTargets.socialPostId, postIds)),
    );
    for (const row of targetPlatforms) {
      const set = platformsByPost.get(row.socialPostId) ?? new Set<string>();
      set.add(row.platform);
      platformsByPost.set(row.socialPostId, set);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posts" description="Every social post you've composed - draft, scheduled, or published." />
      <UpNext events={upcoming} />
      <SocialPostsList
        projectId={project.id}
        posts={posts.map((p) => ({
          ...p,
          status: p.status as SocialPostView["status"],
          scheduledFor: p.scheduledFor?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          platforms: Array.from(platformsByPost.get(p.id) ?? []),
        }))}
      />
    </div>
  );
}
