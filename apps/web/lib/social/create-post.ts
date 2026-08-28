import { eq, inArray } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@seo-tool/db";

// Real shared logic behind POST /api/projects/:projectId/social/posts -
// same shape as Publish's createBlogPost, generalized to social platforms.
export async function createSocialPost(
  userId: string,
  projectId: string,
  opts: { text: string; mediaUrls: string[]; connectionIds: string[] },
) {
  if (!opts.text.trim()) throw new Error("Text is required.");
  if (opts.connectionIds.length === 0) throw new Error("Pick at least one connected platform to post to.");

  return withUserContext(userId, async (tx) => {
    const connections = await tx.select({ id: socialConnections.id }).from(socialConnections).where(inArray(socialConnections.id, opts.connectionIds));
    const validIds = new Set(connections.map((c) => c.id));
    const missing = opts.connectionIds.filter((id) => !validIds.has(id));
    if (missing.length > 0) throw new Error("One or more selected connections no longer exist.");

    const [post] = await tx
      .insert(socialPosts)
      .values({ projectId, body: opts.text, mediaUrls: opts.mediaUrls, createdByUserId: userId })
      .returning();

    await tx.insert(socialPostTargets).values(
      opts.connectionIds.map((socialConnectionId) => ({
        projectId,
        socialPostId: post!.id,
        socialConnectionId,
        adaptedBody: opts.text,
      })),
    );

    const targets = await tx.select().from(socialPostTargets).where(eq(socialPostTargets.socialPostId, post!.id));
    return { post, targets };
  });
}
