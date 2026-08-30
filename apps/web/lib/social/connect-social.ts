import { socialConnections, withUserContext } from "@rosterseo/db";
import { getSocialAdapter, getSocialPlatformDef } from "@rosterseo/social";

// Real shared logic behind POST /api/projects/:projectId/social/connections -
// the manual-credential path (used directly for Bluesky, which has no
// OAuth option, and as the fallback for OAuth-capable platforms when the
// operator hasn't configured that platform's client id/secret). Verifies
// against the real platform before ever persisting credentials, same
// "verification IS the first real call" pattern as Publish's connect-blog.ts.
export async function connectSocial(
  userId: string,
  projectId: string,
  opts: { platform: string; label: string; accountIdentifier: string; credentials: Record<string, string> },
) {
  const platformDef = getSocialPlatformDef(opts.platform);
  if (!platformDef) throw new Error(`Unknown platform: ${opts.platform}`);

  const adapter = getSocialAdapter(opts.platform);
  if (!adapter) throw new Error(`No adapter for platform "${opts.platform}"`);

  try {
    await adapter.verify(opts.credentials, opts.accountIdentifier);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Couldn't connect to ${platformDef.name}`);
  }

  const [connection] = await withUserContext(userId, (tx) =>
    tx
      .insert(socialConnections)
      .values({
        projectId,
        platform: opts.platform,
        label: opts.label,
        authType: platformDef.authType,
        credentials: opts.credentials,
        accountIdentifier: opts.accountIdentifier,
        status: "connected",
      })
      .returning(),
  );

  return connection;
}
