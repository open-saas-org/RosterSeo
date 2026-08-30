import { eq } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";
import { getBlogAdapter, markdownToHtml } from "@rosterseo/publishing";

// Rolls the parent blogPosts row's own status up once every one of its
// targets has left "pending"/"queued"/"publishing" - published if all
// targets succeeded, partial if some did and some didn't, failed if none did.
async function rollUpPostStatus(userId: string, blogPostId: string) {
  const targets = await withUserContext(userId, (tx) => tx.select({ status: blogPostTargets.status }).from(blogPostTargets).where(eq(blogPostTargets.blogPostId, blogPostId)));
  const stillWorking = targets.some((t) => t.status === "pending" || t.status === "queued" || t.status === "publishing");
  if (stillWorking) return;

  const publishedCount = targets.filter((t) => t.status === "published").length;
  const status = publishedCount === 0 ? "failed" : publishedCount === targets.length ? "published" : "partial";
  await withUserContext(userId, (tx) => tx.update(blogPosts).set({ status, updatedAt: new Date() }).where(eq(blogPosts.id, blogPostId)));
}

// Processes one "publish this post to this platform" job - "Publish now"
// and "Schedule for later" both enqueue the exact same job, the only
// difference is whether it was enqueued with a startAfter option, so this
// runner doesn't know or care which one happened.
export async function runBlogPublish(payload: { blogPostTargetId: string; projectId: string; userId: string }) {
  const { blogPostTargetId, userId } = payload;

  const target = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(blogPostTargets).where(eq(blogPostTargets.id, blogPostTargetId)).limit(1);
    return row ?? null;
  });
  if (!target) {
    console.error(`[publish] target ${blogPostTargetId} not found - skipping`);
    return;
  }

  const post = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(blogPosts).where(eq(blogPosts.id, target.blogPostId)).limit(1);
    return row ?? null;
  });
  const connection = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(blogConnections).where(eq(blogConnections.id, target.blogConnectionId)).limit(1);
    return row ?? null;
  });

  if (!post || !connection) {
    await withUserContext(userId, (tx) =>
      tx.update(blogPostTargets).set({ status: "failed", failureReason: !post ? "The post was deleted." : "The connection was disconnected." }).where(eq(blogPostTargets.id, blogPostTargetId)),
    );
    await rollUpPostStatus(userId, target.blogPostId);
    return;
  }

  const adapter = getBlogAdapter(connection.platform);
  if (!adapter) {
    await withUserContext(userId, (tx) => tx.update(blogPostTargets).set({ status: "failed", failureReason: `No adapter for platform "${connection.platform}"` }).where(eq(blogPostTargets.id, blogPostTargetId)));
    await rollUpPostStatus(userId, target.blogPostId);
    return;
  }

  await withUserContext(userId, (tx) => tx.update(blogPostTargets).set({ status: "publishing" }).where(eq(blogPostTargets.id, blogPostTargetId)));

  try {
    const html = markdownToHtml(target.adaptedBody);
    const result = await adapter.publish(connection.credentials, connection.siteIdentifier, { title: target.adaptedTitle, markdown: target.adaptedBody, html, tags: post.tags });
    await withUserContext(userId, (tx) =>
      tx
        .update(blogPostTargets)
        .set({ status: "published", remotePostId: result.remoteId, remoteUrl: result.remoteUrl, publishedAt: new Date(), failureReason: null })
        .where(eq(blogPostTargets.id, blogPostTargetId)),
    );
  } catch (err) {
    console.error(`[publish] send failed for target ${blogPostTargetId}`, err);
    await withUserContext(userId, (tx) =>
      tx
        .update(blogPostTargets)
        .set({ status: "failed", failureReason: err instanceof Error ? err.message : String(err) })
        .where(eq(blogPostTargets.id, blogPostTargetId)),
    );
    await withUserContext(userId, (tx) => tx.update(blogConnections).set({ status: "error", lastError: err instanceof Error ? err.message : String(err) }).where(eq(blogConnections.id, connection.id)));
  }

  await rollUpPostStatus(userId, target.blogPostId);
}
