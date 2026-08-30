import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { registerMerchantApiDeveloper } from "@rosterseo/google";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// POST /api/integrations/merchant/register?projectId=... - real Merchant
// API bootstrap. Body: { merchantAccountId: string } - the numeric
// Merchant Center account ID, found in the Merchant Center URL
// (merchants.google.com/mc/overview?a=<id>) or account switcher. There's
// no auto-discovery available before registration exists (see
// registerMerchantApiDeveloper's comment for why), so the user supplies
// it directly rather than this route guessing. Uses the signed-in user's
// own login email as the developer contact, same email already used to
// connect Google.
//
// projectId arrives as a query param, mirroring google/connect and
// merchant/accounts' own shape (session + explicit project-access check).
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const merchantAccountId = typeof body?.merchantAccountId === "string" ? body.merchantAccountId.trim().replace(/\D/g, "") : "";
  if (!merchantAccountId) {
    return NextResponse.json({ error: "merchantAccountId is required" }, { status: 400 });
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
    const accountName = await registerMerchantApiDeveloper(accessToken, merchantAccountId, session.user.email);
    return NextResponse.json({ accountName });
  } catch (err) {
    console.error("Merchant API developer registration failed", err);
    return NextResponse.json(
      { error: "register_failed", message: err instanceof Error ? err.message : "Registration failed" },
      { status: 502 },
    );
  }
}
