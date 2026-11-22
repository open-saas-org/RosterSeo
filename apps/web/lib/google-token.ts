import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, googleConnections, withUserContext } from "@rosterseo/db";
import { GoogleReauthRequiredError, refreshAccessToken } from "@rosterseo/google";

// Refresh a bit before actual expiry, not right at it - avoids a request
// racing Google's clock and getting a 401 mid-call.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Every real GSC/GA4 API call should get its access token through this,
// not by reading connection.accessToken directly. The stored access token
// is only good for ~1 hour; this transparently exchanges the (long-lived)
// refresh token for a new one when needed and persists the new pair back
// to google_connections, so a project's connection survives server
// restarts and long-lived sessions without the user re-doing OAuth
// consent every time it goes stale.
//
// This is also the one real decrypt point for google_connections'
// accessToken/refreshToken columns: every real caller in this codebase
// reaches a token value through this function rather than reading
// connection.accessToken/refreshToken directly (confirmed by grepping
// every call site), so decrypting here - and re-encrypting whatever gets
// written back below - covers every real usage without needing to touch
// the ~15 route files that just fetch the row for status/routing and
// pass it straight through.
//
// Throws GoogleReauthRequiredError (and flips needs_reconnect on the row)
// only when Google confirms the refresh token itself was revoked - every
// other caller already has a catch block that surfaces "needs
// reconnecting" messaging on any thrown error, so this doesn't need its
// own special handling beyond persisting the flag for the Integrations/
// Dashboard cards to read via toConnectionStatus.
export async function getValidAccessToken(
  userId: string,
  connection: typeof googleConnections.$inferSelect,
): Promise<string> {
  if (connection.expiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()) {
    return decryptSecret(connection.accessToken);
  }

  try {
    const refreshed = await refreshAccessToken(decryptSecret(connection.refreshToken));
    await withUserContext(userId, (tx) =>
      tx
        .update(googleConnections)
        .set({ accessToken: encryptSecret(refreshed.accessToken), expiresAt: refreshed.expiresAt, needsReconnect: false })
        .where(eq(googleConnections.id, connection.id)),
    );
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      await withUserContext(userId, (tx) =>
        tx.update(googleConnections).set({ needsReconnect: true }).where(eq(googleConnections.id, connection.id)),
      );
    }
    throw err;
  }
}
