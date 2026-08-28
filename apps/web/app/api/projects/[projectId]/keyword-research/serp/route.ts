import { NextResponse } from "next/server";
import { checkKeywordRanking, DataForSeoNotConfiguredError } from "@seo-tool/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/keyword-research/serp?keyword=...&locationCode=...
// Real top-10 organic SERP for the detail panel's SERP Analysis view -
// uses checkKeywordRanking() (a real numeric locationCode + device), not
// getSerpResults() (which only accepts a free-text location name resolved
// through a crude ~19-country map and would silently default to US for
// most countries - the exact bug this whole feature exists to fix).

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword")?.trim();
  const locationCode = Number(searchParams.get("locationCode"));

  if (!keyword || !Number.isFinite(locationCode)) {
    return NextResponse.json({ error: "keyword and locationCode are required" }, { status: 400 });
  }

  try {
    const { organicResults } = await checkKeywordRanking(keyword, locationCode, "desktop");
    return NextResponse.json({ results: organicResults });
  } catch (err) {
    const message = err instanceof DataForSeoNotConfiguredError ? err.message : "Couldn't fetch real SERP results right now.";
    console.error("[keyword-research/serp] real SERP check failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
