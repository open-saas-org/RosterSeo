import { NextRequest, NextResponse } from "next/server";
import { listLocationCountries, listLocationStates, listLocationCities } from "@seo-tool/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/local-seo/business-profile/geo?level=country
// GET .../geo?level=state&country=<ISO code>
// GET .../geo?level=city&country=<ISO code>&state=<location_code>
// Real DataForSEO location hierarchy (the same source of truth
// searchMapsBusinesses's locationCode param needs) - backs the Country /
// State / City selector in ManualLocationForm.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");

  try {
    if (level === "country") {
      const options = await listLocationCountries();
      return NextResponse.json({ options });
    }

    if (level === "state") {
      const country = searchParams.get("country");
      if (!country) return NextResponse.json({ error: "country is required" }, { status: 400 });
      const options = await listLocationStates(country);
      return NextResponse.json({ options });
    }

    if (level === "city") {
      const country = searchParams.get("country");
      const state = searchParams.get("state");
      if (!country || !state) return NextResponse.json({ error: "country and state are required" }, { status: 400 });
      const options = await listLocationCities(country, Number(state));
      return NextResponse.json({ options });
    }

    return NextResponse.json({ error: "level must be 'country', 'state', or 'city'" }, { status: 400 });
  } catch (err) {
    console.error("Failed to load real location list", err);
    return NextResponse.json({ error: "Couldn't load locations. Try again." }, { status: 502 });
  }
});
