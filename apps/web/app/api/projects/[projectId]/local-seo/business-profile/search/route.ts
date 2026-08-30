import { NextRequest, NextResponse } from "next/server";
import { searchMapsBusinesses, DataForSeoNotConfiguredError } from "@rosterseo/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/local-seo/business-profile/search?query=...&locationCode=...
// Real Google Maps business search (DataForSEO, same API Grid Ranking
// already uses) - lets a user find and pick their own real business by
// name instead of typing lat/lng by hand. No Google Business Profile OAuth
// needed at all: this is public Maps listing data, not the owner's private
// GBP account, so it works whether or not Google has approved GBP API
// access for this project. `locationCode` comes from the real Country/
// State/City selector (.../business-profile/geo) - never a hand-typed
// string, so there's no "location format" error class to handle here.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  const locationCode = Number(searchParams.get("locationCode"));
  if (!query || !locationCode || Number.isNaN(locationCode)) {
    return NextResponse.json({ error: "query and locationCode are required" }, { status: 400 });
  }

  // No mock fallback here on purpose (see searchMapsBusinesses's own
  // comment) - real results, a real empty list, or a real, actionable
  // error. Never fake candidates standing in for real ones.
  try {
    const results = await searchMapsBusinesses(query, locationCode);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof DataForSeoNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("GBP-free business search failed", err);
    return NextResponse.json({ error: "Search failed. Try again shortly." }, { status: 502 });
  }
});
