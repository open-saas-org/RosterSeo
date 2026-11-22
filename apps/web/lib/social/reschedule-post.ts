import { and, eq } from "drizzle-orm";
import { socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
import { socialPublishJob } from "@rosterseo/jobs";

// See lib/publish/reschedule-post.ts's identical comment - same mechanism,
// social side.
export async function rescheduleSocialPost(userId: string, projectId: string, postId: string, scheduledFor: Date) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");
  if (post.status !== "scheduled") throw new Error(`Only a scheduled post can be rescheduled (this post is "${post.status}").`);

  const targets = await withUserContext(userId, (tx) => tx.select().from(socialPostTargets).where(eq(socialPostTargets.socialPostId, postId)));
  const pending = targets.filter((t): t is typeof t & { pgBossJobId: string } => t.status === "queued" && Boolean(t.pgBossJobId));

  let rescheduled = 0;
  for (const target of pending) {
    const moved = await socialPublishJob.reschedule(target.pgBossJobId, scheduledFor);
    if (moved > 0) rescheduled += 1;
  }

  await withUserContext(userId, (tx) => tx.update(socialPosts).set({ scheduledFor, updatedAt: new Date() }).where(eq(socialPosts.id, postId)));

  return { rescheduled, totalTargets: targets.length };
}
