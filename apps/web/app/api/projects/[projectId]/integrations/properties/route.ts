import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { listGA4Properties, listSearchConsoleSites, listMerchantAccounts } from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// GET /api/projects/:projectId/integrations/properties?service=gsc|ga4|merchant
// Lists the real GSC sites / GA4 properties / Merchant Center accounts the
// connected Google account can access, for PropertyPicker - the connect
// flow alone doesn't say *which* site/property/account to sync, and
// there's no honest way to mock "here are your real properties," so this
// always makes a live call.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const service = new URL(req.url).searchParams.get("service");
  if (service !== "gsc" && service !== "ga4" && service !== "merchant") {
    return NextResponse.json({ error: "service must be 'gsc', 'ga4', or 'merchant'" }, { status: 400 });
  }

  const connection = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, service)))
      .limit(1);
    return row ?? null;
  });

  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, connection);
    const properties =
      service === "gsc"
        ? (await listSearchConsoleSites(accessToken)).map((site) => ({
            id: site.siteUrl,
            label: site.siteUrl,
          }))
        : service === "ga4"
          ? (await listGA4Properties(accessToken)).map((property) => ({
              id: property.propertyId,
              label: property.accountName ? `${property.displayName} (${property.accountName})` : property.displayName,
            }))
          : (await listMerchantAccounts(accessToken)).map((account) => ({
              id: account.id,
              label: `${account.name} (${account.accountId})`,
            }));

    return NextResponse.json({ properties });
  } catch (err) {
    console.error(`Failed to list ${service} properties`, err);
    // Google returns a 403/401 with a distinct message when the underlying
    // API (Search Console API / Analytics Admin API / Merchant API) has
    // never been enabled on the OAuth client's Google Cloud project - a
    // one-time console setup step, unrelated to whether the token itself
    // is valid. Reconnecting doesn't fix this, so it needs its own message
    // rather than being folded into "needs_reconnect" (which sends people
    // to re-auth for nothing - this exact confusion is what prompted this
    // distinction).
    const message = err instanceof Error ? err.message : "";
    if (/has not been used in project|it is disabled/i.test(message)) {
      return NextResponse.json({ error: "api_not_enabled", message }, { status: 403 });
    }
    // Merchant API specific, confirmed live: a real 401 whose body says
    // the GCP project isn't registered as a linked API developer under
    // the Merchant Center account - a one-time step done inside Merchant
    // Center itself (Settings > API access), not Cloud Console, and not
    // fixed by reconnecting Google OAuth either.
    if (/not registered with the merchant account/i.test(message)) {
      return NextResponse.json({ error: "merchant_not_registered", message }, { status: 403 });
    }
    return NextResponse.json({ error: "needs_reconnect" }, { status: 502 });
  }
});
