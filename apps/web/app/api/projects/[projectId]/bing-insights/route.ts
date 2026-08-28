import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { isBingConfigured, getBingRankAndTrafficStats } from "@seo-tool/bing";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { getDateRange } from "@/lib/date-range";

// GET   /api/projects/:projectId/bing-insights?days=7|28|90 - real Bing
//       GetRankAndTrafficStats for the project's saved bingSiteUrl. Bing's
//       method takes no date params and returns its own available window,
//       so the days filter is applied client-side in getBingRankAndTrafficStats
//       (same reasoning as GA4's near-real-time data, no GSC-style lag
//       trimming needed here - not yet confirmed live against a real key).
// PATCH body: { siteUrl } - saves which verified Bing site this project
//       reports on, picked from sites/route.ts's real GetUserSites list.

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
  if (!isBingConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }
  if (!project.bingSiteUrl) {
    return NextResponse.json({ error: "no_site" }, { status: 400 });
  }

  try {
    const { start, end } = getDateRange(days);
    const rows = await getBingRankAndTrafficStats(project.bingSiteUrl, start, end);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("Bing GetRankAndTrafficStats failed", err);
    return NextResponse.json({ error: "bing_api_error" }, { status: 502 });
  }
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const siteUrl = typeof body?.siteUrl === "string" ? body.siteUrl.trim() : "";
  if (!siteUrl) {
    return NextResponse.json({ error: "siteUrl is required" }, { status: 400 });
  }

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx.update(projects).set({ bingSiteUrl: siteUrl }).where(eq(projects.id, projectId)).returning(),
  );

  return NextResponse.json({ project: updated });
});
