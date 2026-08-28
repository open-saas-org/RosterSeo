import { NextResponse } from "next/server";
import { isBingConfigured, listBingSites } from "@seo-tool/bing";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/bing-insights/sites - real GetUserSites call
// against the workspace's single global Bing Webmaster API key, for the
// site picker. Not project-scoped data itself (site verification lives on
// the Bing account, not per-project) - projectId is only used for access
// control, matching how the GSC/GA4 property pickers work.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!isBingConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  try {
    const sites = await listBingSites();
    return NextResponse.json({ sites });
  } catch (err) {
    console.error("Bing GetUserSites failed", err);
    return NextResponse.json({ error: "bing_api_error" }, { status: 502 });
  }
});
