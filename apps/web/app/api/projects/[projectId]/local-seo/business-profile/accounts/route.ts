import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, withUserContext } from "@rosterseo/db";
import { listBusinessAccounts, GoogleBusinessProfileNotApprovedError } from "@rosterseo/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

// GET /api/projects/:projectId/local-seo/business-profile/accounts
// Real GBP account listing - dormant plumbing kept ready for a future
// GBP-connected feature (Local SEO itself runs on DataForSEO's Business
// Data API, no OAuth needed - see .../business-profile/search). Needs the
// project's org to have a real `gbp` google_connections row from the
// Integrations page.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
    const accounts = await listBusinessAccounts(accessToken);
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Failed to list GBP accounts", err);
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
