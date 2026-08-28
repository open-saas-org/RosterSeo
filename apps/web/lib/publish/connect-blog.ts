import { blogConnections, withUserContext } from "@seo-tool/db";
import { getBlogAdapter, getBlogPlatformDef } from "@seo-tool/publishing";

// Real shared logic behind POST /api/projects/:projectId/blog/connections -
// verifies against the real platform (a live API call, same "verification
// IS the first real call" pattern as packages/wordpress) before ever
// persisting credentials.
export async function connectBlog(
  userId: string,
  projectId: string,
  opts: { platform: string; label: string; siteIdentifier: string; credentials: Record<string, string> },
) {
  const platformDef = getBlogPlatformDef(opts.platform);
  if (!platformDef) throw new Error(`Unknown platform: ${opts.platform}`);
  if (platformDef.gated) throw new Error(`${platformDef.name} isn't connectable yet - it's pending Google's API approval.`);

  const adapter = getBlogAdapter(opts.platform);
  if (!adapter) throw new Error(`No adapter for platform "${opts.platform}"`);

  try {
    await adapter.verify(opts.credentials, opts.siteIdentifier);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Couldn't connect to ${platformDef.name}`);
  }

  const [connection] = await withUserContext(userId, async (tx) => {
    return tx
      .insert(blogConnections)
      .values({
        projectId,
        platform: opts.platform,
        label: opts.label,
        authType: platformDef.authType,
        credentials: opts.credentials,
        siteIdentifier: opts.siteIdentifier,
        status: "connected",
      })
      .returning();
  });

  return connection;
}
