import type { googleConnections } from "@seo-tool/db";

export type GoogleConnectionStatus = "not_connected" | "connected" | "needs_reconnect";

export interface GoogleConnectionInfo {
  service: "gsc" | "ga4" | "gbp" | "merchant";
  status: GoogleConnectionStatus;
  propertyId: string | null;
  connectedAt: string | null;
}

// Shared by app/api/projects/[projectId]/integrations/route.ts and the
// Integrations / GSC Insights / Dashboard pages, so connection status is
// computed in exactly one place and no two pages can ever disagree.
//
// `conn` is the organization-level google_connections row (one Google
// OAuth grant per org per service, shared by every project underneath).
// `propertyId` is passed in separately because it's no longer a column on
// that row - it's per-project now (projects.gscPropertyId / ga4PropertyId),
// since one connection can back many projects each syncing a different
// property from the same connected Google account.
export function toConnectionStatus(
  conn: typeof googleConnections.$inferSelect | undefined,
  propertyId: string | null,
  service: "gsc" | "ga4" | "gbp" | "merchant",
): GoogleConnectionInfo {
  if (!conn) {
    return { service, status: "not_connected", propertyId: null, connectedAt: null };
  }
  // Driven by the real needs_reconnect flag (apps/web/lib/google-token.ts
  // sets it only when Google's refresh confirmed the refresh token itself
  // was revoked), not by comparing expiresAt to now - an expired ACCESS
  // token is expected and refreshed transparently before every real use,
  // not a reason to send the user through OAuth consent again.
  return {
    service,
    status: conn.needsReconnect ? "needs_reconnect" : "connected",
    propertyId: propertyId || null,
    connectedAt: conn.connectedAt.toISOString(),
  };
}
