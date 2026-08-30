import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, localBusinessProfiles, withUserContext } from "@rosterseo/db";
import { getLocationPerformance, GoogleBusinessProfileNotApprovedError } from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// GET /api/projects/:projectId/local-seo/business-profile/performance?days=30
// Real GBP Performance API (views/calls/chats/bookings/direction requests/
// website clicks/menu clicks) for whichever location was linked via
// .../business-profile/gbp - reads the saved location rather than taking
// one as a param, since there's exactly one real link per project.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const days = Number(new URL(req.url).searchParams.get("days") ?? "30");

  const [connection, profile] = await withUserContext(session.user.id, async (tx) => {
    const [conn] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "gbp")))
      .limit(1);
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return [conn ?? null, row ?? null];
  });
  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }
  if (!profile?.gbpLocationId) {
    return NextResponse.json({ error: "no_location_linked" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, connection);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    const rows = await getLocationPerformance(accessToken, profile.gbpLocationId, startDate, endDate);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("Failed to fetch GBP performance", err);
    if (err instanceof GoogleBusinessProfileNotApprovedError) {
      return NextResponse.json({ error: "gbp_not_approved", message: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "";
    if (/has not been used in project|it is disabled/i.test(message)) {
      return NextResponse.json({ error: "api_not_enabled", message }, { status: 403 });
    }
    return NextResponse.json({ error: "needs_reconnect" }, { status: 502 });
  }
});
