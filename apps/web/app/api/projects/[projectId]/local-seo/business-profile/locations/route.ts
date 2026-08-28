import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@seo-tool/db";
import { listBusinessLocations, GoogleBusinessProfileNotApprovedError } from "@seo-tool/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// GET /api/projects/:projectId/local-seo/business-profile/locations?accountId=accounts/123
// Real GBP location listing for one account - dormant plumbing, see
// accounts/route.ts for context.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const connection = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "gbp")))
      .limit(1);
    return row ?? null;
  });
  if (!connection) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id, connection);
    const locations = await listBusinessLocations(accessToken, accountId);
    return NextResponse.json({ locations });
  } catch (err) {
    console.error("Failed to list GBP locations", err);
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
