import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { isGoogleOAuthConfigured, getMerchantProductPerformance } from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { getDateRange } from "@/lib/date-range";

// GET /api/projects/:projectId/merchant-insights?days=7|28|90
// Real Merchant API product-performance data (clicks/impressions/CTR/
// conversions) for the project's picked Merchant Center account. Merchant
// Center's Reports API is near-real-time like GA4, not GSC-laggy, so
// getDateRange()'s plain window is enough - no adaptive trimming needed.

type RouteParams = { projectId: string };

const VALID_DAYS = [7, 28, 90];

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const days = Number(new URL(req.url).searchParams.get("days") ?? "28");
  if (!VALID_DAYS.includes(days)) {
    return NextResponse.json({ error: "days must be 7, 28, or 90" }, { status: 400 });
  }
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  const conn = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "merchant")))
      .limit(1);
    return row ?? null;
  });

  const merchant = toConnectionStatus(conn ?? undefined, project.merchantAccountId, "merchant");
  if (merchant.status !== "connected" || !merchant.propertyId || !conn) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, conn);
    const { start, end } = getDateRange(days);
    const rows = await getMerchantProductPerformance(accessToken, merchant.propertyId, start, end);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("Merchant insights fetch failed", err);
    const message = err instanceof Error ? err.message : "";
    if (/has not been used in project|it is disabled/i.test(message)) {
      return NextResponse.json({ error: "api_not_enabled", message }, { status: 403 });
    }
    return NextResponse.json({ error: "needs_reconnect" }, { status: 502 });
  }
});
