import { and, eq } from "drizzle-orm";
import { socialPostTargets, socialPosts, withUserContext } from "@rosterseo/db";
import { socialPublishJob } from "@rosterseo/jobs";

// Real shared logic behind POST .../social/posts/[postId]/publish - same
// "publish now vs schedule is just whether startAfter is set" shape as
// Publish's scheduleBlogPost.
export async function scheduleSocialPost(userId: string, projectId: string, postId: string, scheduledFor?: Date) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");

  const targets = await withUserContext(userId, (tx) => tx.select().from(socialPostTargets).where(eq(socialPostTargets.socialPostId, postId)));
  if (targets.length === 0) throw new Error("This post has no platforms selected.");

  await withUserContext(userId, (tx) =>
    tx
      .update(socialPosts)
      .set({ status: scheduledFor ? "scheduled" : "publishing", scheduledFor: scheduledFor ?? null, updatedAt: new Date() })
      .where(eq(socialPosts.id, postId)),
  );
  await withUserContext(userId, (tx) => tx.update(socialPostTargets).set({ status: "queued" }).where(eq(socialPostTargets.socialPostId, postId)));

  await Promise.all(
    targets.map((target) => socialPublishJob.enqueue({ socialPostTargetId: target.id, projectId, userId }, scheduledFor ? { startAfter: scheduledFor } : undefined)),
  );

  return { queued: targets.length };
}
