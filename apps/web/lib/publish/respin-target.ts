import { and, eq } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";
import { respinBlogPost } from "@rosterseo/ai-visibility";

// Real shared logic behind POST .../blog/posts/[postId]/targets/[targetId]/respin -
// AI-adapts the master post for one specific platform, overwriting that
// target's adaptedTitle/adaptedBody (which the composer shows for review
// before send - this never sends anything itself).
export async function respinBlogPostTarget(userId: string, projectId: string, postId: string, targetId: string, projectDomain: string) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(blogPosts).where(and(eq(blogPosts.id, postId), eq(blogPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");

  const [target] = await withUserContext(userId, (tx) => tx.select().from(blogPostTargets).where(and(eq(blogPostTargets.id, targetId), eq(blogPostTargets.blogPostId, postId))).limit(1));
  if (!target) throw new Error("Target not found.");

  const [connection] = await withUserContext(userId, (tx) => tx.select({ platform: blogConnections.platform }).from(blogConnections).where(eq(blogConnections.id, target.blogConnectionId)).limit(1));
  if (!connection) throw new Error("Connection not found.");

  const outcome = await respinBlogPost({ platform: connection.platform, sourceTitle: post.title, sourceBody: post.body, projectDomain });

  if (outcome.status === "not_configured") throw new Error("Configure OpenRouter (OPENROUTER_API_KEY) to generate AI respins.");
  if (outcome.status === "failed") throw new Error(`Respin failed: ${outcome.error}`);

  const [updated] = await withUserContext(userId, (tx) =>
    tx.update(blogPostTargets).set({ adaptedTitle: outcome.result.title, adaptedBody: outcome.result.body }).where(eq(blogPostTargets.id, targetId)).returning(),
  );

  return updated;
}
