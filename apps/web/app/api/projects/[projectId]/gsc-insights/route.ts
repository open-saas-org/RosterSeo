import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { isGoogleOAuthConfigured } from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { fetchGscExactWindow } from "@/lib/gsc-fetch";

// GET /api/projects/:projectId/gsc-insights?days=7|28|90
// Real Search Console data for a chosen window: one real "date"-dimension
// fetch (daily performance + the headline metric cards) and one real
// "query,page"-dimension fetch (Queries/Pages/Striking-distance, all
// derived client-side from this single real breakdown - see
// gsc-insights-breakdown.ts). Two real GSC calls per request, matching
// what the initial server-rendered page already made on first load.

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
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "gsc")))
      .limit(1);
    return row ?? null;
  });

  const gsc = toConnectionStatus(conn ?? undefined, project.gscPropertyId, "gsc");
  if (gsc.status !== "connected" || !gsc.propertyId || !conn) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, conn);
    const { dailyRows, queryPageRows } = await fetchGscExactWindow(accessToken, gsc.propertyId, days);
    return NextResponse.json({ dailyRows, queryPageRows });
  } catch (err) {
    console.error("GSC insights fetch failed", err);
    return NextResponse.json({ error: "needs_reconnect" }, { status: 502 });
  }
});
