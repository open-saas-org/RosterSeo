import { eq, inArray } from "drizzle-orm";
import { blogConnections, blogPostTargets, blogPosts, withUserContext } from "@rosterseo/db";

// Real shared logic behind POST /api/projects/:projectId/blog/posts -
// inserts the canonical post plus one blogPostTargets row per selected
// connection, each pre-seeded with the master title/body so every target
// has real content to send even before anyone clicks "respin".
export async function createBlogPost(
  userId: string,
  projectId: string,
  opts: { title: string; body: string; excerpt?: string; coverImageUrl?: string; tags: string[]; connectionIds: string[] },
) {
  if (!opts.title.trim()) throw new Error("Title is required.");
  if (!opts.body.trim()) throw new Error("Body is required.");
  if (opts.connectionIds.length === 0) throw new Error("Pick at least one connected platform to publish to.");

  return withUserContext(userId, async (tx) => {
    const connections = await tx.select({ id: blogConnections.id }).from(blogConnections).where(inArray(blogConnections.id, opts.connectionIds));
    const validIds = new Set(connections.map((c) => c.id));
    const missing = opts.connectionIds.filter((id) => !validIds.has(id));
    if (missing.length > 0) throw new Error("One or more selected connections no longer exist.");

    const [post] = await tx
      .insert(blogPosts)
      .values({
        projectId,
        title: opts.title,
        body: opts.body,
        excerpt: opts.excerpt || null,
        coverImageUrl: opts.coverImageUrl || null,
        tags: opts.tags,
        createdByUserId: userId,
      })
      .returning();

    await tx.insert(blogPostTargets).values(
      opts.connectionIds.map((blogConnectionId) => ({
        projectId,
        blogPostId: post!.id,
        blogConnectionId,
        adaptedTitle: opts.title,
        adaptedBody: opts.body,
      })),
    );

    const targets = await tx.select().from(blogPostTargets).where(eq(blogPostTargets.blogPostId, post!.id));
    return { post, targets };
  });
}
