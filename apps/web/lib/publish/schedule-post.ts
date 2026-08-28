import { and, eq } from "drizzle-orm";
import { blogPostTargets, blogPosts, withUserContext } from "@seo-tool/db";
import { blogPublishJob } from "@seo-tool/jobs";

// Real shared logic behind POST .../blog/posts/[postId]/publish - "Publish
// now" and "Schedule for later" both call this, the only difference being
// whether scheduledFor is set. Either way, sending happens entirely via
// blogPublishJob in the worker - never inline here - so this function only
// ever flips status to queued and enqueues one job per target.
export async function scheduleBlogPost(userId: string, projectId: string, postId: string, scheduledFor?: Date) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");

  const targets = await withUserContext(userId, (tx) => tx.select().from(blogPostTargets).where(eq(blogPostTargets.blogPostId, postId)));
  if (targets.length === 0) throw new Error("This post has no platforms selected.");

  await withUserContext(userId, (tx) =>
    tx
      .update(blogPosts)
      .set({ status: scheduledFor ? "scheduled" : "publishing", scheduledFor: scheduledFor ?? null, updatedAt: new Date() })
      .where(eq(blogPosts.id, postId)),
  );
  await withUserContext(userId, (tx) => tx.update(blogPostTargets).set({ status: "queued" }).where(eq(blogPostTargets.blogPostId, postId)));

  await Promise.all(
    targets.map((target) =>
      blogPublishJob.enqueue({ blogPostTargetId: target.id, projectId, userId }, scheduledFor ? { startAfter: scheduledFor } : undefined),
    ),
  );

  return { queued: targets.length };
}
