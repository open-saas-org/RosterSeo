import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { listMerchantAccounts } from "@rosterseo/google";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// GET /api/integrations/merchant/accounts?projectId=... - real Content API
// accounts.authinfo call for the connected Merchant Center account, shown
// read-only in the Integrations page's connection card (connect-only for
// now - no per-project "picked account" concept yet).
//
// projectId arrives as a query param (not a path segment) since this
// mirrors google/connect's shape - session + explicit project-access check
// applied directly, same reasoning as that route's own comment.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required" }, { status: 400 });
  }

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const connection = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "merchant")))
      .limit(1);
    return row ?? null;
  });
  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, connection);
    const accounts = await listMerchantAccounts(accessToken);
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Failed to list Merchant Center accounts", err);
    // Same distinction PropertyPicker's route makes for GSC/GA4: Google
    // returns a 403 with this exact message when the Content API for
    // Shopping has never been enabled on the OAuth client's Google Cloud
    // project - a one-time Console setup step, unrelated to the token or
    // connection being valid. Reconnecting doesn't fix this.
    const message = err instanceof Error ? err.message : "";
    if (/has not been used in project|it is disabled/i.test(message)) {
      return NextResponse.json({ error: "api_not_enabled", message }, { status: 403 });
    }
    return NextResponse.json({ error: "merchant_api_error" }, { status: 502 });
  }
}
