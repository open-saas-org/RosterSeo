import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import {
  getGA4CountryBreakdown,
  getGA4DeviceBreakdown,
  getGA4OrganicTrend,
  getGA4TopLandingPages,
  isGoogleOAuthConfigured,
} from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { getDateRange } from "@/lib/date-range";

// GET /api/projects/:projectId/ga-insights?days=7|28|90
// Real GA4 Organic Search data for a chosen window - four real Analytics
// Data API calls (trend, landing pages, device split, country split), all
// scoped to sessionDefaultChannelGroup = "Organic Search" the same way the
// initial server-rendered page's fetch is.

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
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "ga4")))
      .limit(1);
    return row ?? null;
  });

  const ga4 = toConnectionStatus(conn ?? undefined, project.ga4PropertyId, "ga4");
  if (ga4.status !== "connected" || !ga4.propertyId || !conn) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  const { start, end } = getDateRange(days);

  try {
    const accessToken = await getValidAccessToken(session.user.id, conn);
    const [trend, landingPages, deviceRows, countryRows] = await Promise.all([
      getGA4OrganicTrend(accessToken, ga4.propertyId, start, end),
      getGA4TopLandingPages(accessToken, ga4.propertyId, start, end),
      getGA4DeviceBreakdown(accessToken, ga4.propertyId, start, end),
      getGA4CountryBreakdown(accessToken, ga4.propertyId, start, end),
    ]);
    return NextResponse.json({ trend, landingPages, deviceRows, countryRows });
  } catch (err) {
    console.error("GA insights fetch failed", err);
    return NextResponse.json({ error: "needs_reconnect" }, { status: 502 });
  }
});
