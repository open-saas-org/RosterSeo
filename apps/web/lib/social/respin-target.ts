import { and, eq } from "drizzle-orm";
import { socialConnections, socialPostTargets, socialPosts, withUserContext } from "@seo-tool/db";
import { respinSocialPost } from "@seo-tool/ai-visibility";
import { getSocialPlatformDef } from "@seo-tool/social";

// Real shared logic behind POST .../social/posts/[postId]/targets/[targetId]/respin -
// AI-adapts the master post for one specific platform, respecting that
// platform's real character limit.
export async function respinSocialPostTarget(userId: string, projectId: string, postId: string, targetId: string, projectDomain: string) {
  const [post] = await withUserContext(userId, (tx) => tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.projectId, projectId))).limit(1));
  if (!post) throw new Error("Post not found.");

  const [target] = await withUserContext(userId, (tx) => tx.select().from(socialPostTargets).where(and(eq(socialPostTargets.id, targetId), eq(socialPostTargets.socialPostId, postId))).limit(1));
  if (!target) throw new Error("Target not found.");

  const [connection] = await withUserContext(userId, (tx) => tx.select({ platform: socialConnections.platform }).from(socialConnections).where(eq(socialConnections.id, target.socialConnectionId)).limit(1));
  if (!connection) throw new Error("Connection not found.");

  const platformDef = getSocialPlatformDef(connection.platform);
  const outcome = await respinSocialPost({ platform: connection.platform, sourceText: post.body, charLimit: platformDef?.charLimit, projectDomain });

  if (outcome.status === "not_configured") throw new Error("Configure OpenRouter (OPENROUTER_API_KEY) to generate AI respins.");
  if (outcome.status === "failed") throw new Error(`Respin failed: ${outcome.error}`);

  const [updated] = await withUserContext(userId, (tx) => tx.update(socialPostTargets).set({ adaptedBody: outcome.result.text }).where(eq(socialPostTargets.id, targetId)).returning());

  return updated;
}
