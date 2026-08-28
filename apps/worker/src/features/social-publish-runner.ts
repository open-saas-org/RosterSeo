import { eq } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@seo-tool/db";
import { getSocialAdapter } from "@seo-tool/social";

// Same rollup shape as blog-publish-runner.ts's rollUpPostStatus.
async function rollUpPostStatus(userId: string, socialPostId: string) {
  const targets = await withUserContext(userId, (tx) => tx.select({ status: socialPostTargets.status }).from(socialPostTargets).where(eq(socialPostTargets.socialPostId, socialPostId)));
  const stillWorking = targets.some((t) => t.status === "pending" || t.status === "queued" || t.status === "publishing");
  if (stillWorking) return;

  const publishedCount = targets.filter((t) => t.status === "published").length;
  const status = publishedCount === 0 ? "failed" : publishedCount === targets.length ? "published" : "partial";
  await withUserContext(userId, (tx) => tx.update(socialPosts).set({ status, updatedAt: new Date() }).where(eq(socialPosts.id, socialPostId)));
}

// Processes one "post this update to this platform" job - mirrors
// runBlogPublish exactly, just against social_post_targets/social_connections.
export async function runSocialPublish(payload: { socialPostTargetId: string; projectId: string; userId: string }) {
  const { socialPostTargetId, userId } = payload;

  const target = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(socialPostTargets).where(eq(socialPostTargets.id, socialPostTargetId)).limit(1);
    return row ?? null;
  });
  if (!target) {
    console.error(`[social] target ${socialPostTargetId} not found - skipping`);
    return;
  }

  const post = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(socialPosts).where(eq(socialPosts.id, target.socialPostId)).limit(1);
    return row ?? null;
  });
  const connection = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(socialConnections).where(eq(socialConnections.id, target.socialConnectionId)).limit(1);
    return row ?? null;
  });

  if (!post || !connection) {
    await withUserContext(userId, (tx) =>
      tx.update(socialPostTargets).set({ status: "failed", failureReason: !post ? "The post was deleted." : "The connection was disconnected." }).where(eq(socialPostTargets.id, socialPostTargetId)),
    );
    await rollUpPostStatus(userId, target.socialPostId);
    return;
  }

  const adapter = getSocialAdapter(connection.platform);
  if (!adapter) {
    await withUserContext(userId, (tx) =>
      tx.update(socialPostTargets).set({ status: "failed", failureReason: `No adapter for platform "${connection.platform}"` }).where(eq(socialPostTargets.id, socialPostTargetId)),
    );
    await rollUpPostStatus(userId, target.socialPostId);
    return;
  }

  await withUserContext(userId, (tx) => tx.update(socialPostTargets).set({ status: "publishing" }).where(eq(socialPostTargets.id, socialPostTargetId)));

  try {
    const result = await adapter.publish(connection.credentials, connection.accountIdentifier, { text: target.adaptedBody, mediaUrls: post.mediaUrls });
    await withUserContext(userId, (tx) =>
      tx
        .update(socialPostTargets)
        .set({ status: "published", remotePostId: result.remoteId, remoteUrl: result.remoteUrl, publishedAt: new Date(), failureReason: null })
        .where(eq(socialPostTargets.id, socialPostTargetId)),
    );
  } catch (err) {
    console.error(`[social] send failed for target ${socialPostTargetId}`, err);
    await withUserContext(userId, (tx) =>
      tx
        .update(socialPostTargets)
        .set({ status: "failed", failureReason: err instanceof Error ? err.message : String(err) })
        .where(eq(socialPostTargets.id, socialPostTargetId)),
    );
    await withUserContext(userId, (tx) => tx.update(socialConnections).set({ status: "error", lastError: err instanceof Error ? err.message : String(err) }).where(eq(socialConnections.id, connection.id)));
  }

  await rollUpPostStatus(userId, target.socialPostId);
}
