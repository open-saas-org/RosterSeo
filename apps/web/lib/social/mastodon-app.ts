import { eq } from "drizzle-orm";
import { db, mastodonApps } from "@rosterseo/db";
import { registerMastodonApp } from "@rosterseo/social";

// mastodon_apps is instance-wide, not project-scoped (see its own schema
// comment) - a plain db call, not withUserContext, matching the same
// RLS-exempt pattern mcp_api_keys/provider_spend_log already use.
export async function getOrCreateMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string }> {
  const normalized = instanceUrl.replace(/\/+$/, "");
  const [existing] = await db.select().from(mastodonApps).where(eq(mastodonApps.instanceUrl, normalized)).limit(1);
  if (existing) return { clientId: existing.clientId, clientSecret: existing.clientSecret };

  const { clientId, clientSecret } = await registerMastodonApp(normalized, redirectUri);
  await db.insert(mastodonApps).values({ instanceUrl: normalized, clientId, clientSecret }).onConflictDoNothing();
  return { clientId, clientSecret };
}
