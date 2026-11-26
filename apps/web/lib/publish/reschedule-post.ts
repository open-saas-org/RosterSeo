import { and, eq } from "drizzle-orm";
import { blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";
import { blogPublishJob } from "@rosterseo/jobs";

// Moves an already-`scheduled` post to a new time, without touching
// targets that have already started publishing. Deliberately separate
// from scheduleBlogPost (the first-publish transition) - this only ever
// updates jobs that are still sitting in the queue (status "queued" +
// a real pgBossJobId), via blogPublishJob.reschedule()'s in-place
// boss.update(), never a second enqueue.
export async function rescheduleBlogPost(userId: string, projectId: string, postId: string, scheduledFor: Date) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");
  if (post.status !== "scheduled") throw new Error(`Only a scheduled post can be rescheduled (this post is "${post.status}").`);

  const targets = await withUserContext(userId, (tx) => tx.select().from(blogPostTargets).where(eq(blogPostTargets.blogPostId, postId)));
  const pending = targets.filter((t): t is typeof t & { pgBossJobId: string } => t.status === "queued" && Boolean(t.pgBossJobId));

  let rescheduled = 0;
  for (const target of pending) {
    const moved = await blogPublishJob.reschedule(target.pgBossJobId, scheduledFor);
    if (moved > 0) rescheduled += 1;
  }

  await withUserContext(userId, (tx) => tx.update(blogPosts).set({ scheduledFor, updatedAt: new Date() }).where(eq(blogPosts.id, postId)));

  return { rescheduled, totalTargets: targets.length };
}
