import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { localBusinessProfiles, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// PATCH /api/projects/:projectId/local-seo/monitor/config
// Body: { trackedKeyword, gridSize: 3|5|7, radiusKm, autoTrackEnabled }.
// Saves Monitor's config onto the project's business profile row - both
// the on-demand "Run now" scan and the weekly scheduled scan read this
// same row, so there's exactly one place tracking config lives.

type RouteParams = { projectId: string };

const VALID_GRID_SIZES = [3, 5, 7];
const MAX_RADIUS_KM = 50;

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const trackedKeyword = typeof body?.trackedKeyword === "string" ? body.trackedKeyword.trim() : "";
  const gridSize = Number(body?.gridSize);
  const radiusKm = Number(body?.radiusKm);
  const autoTrackEnabled = Boolean(body?.autoTrackEnabled);

  if (!trackedKeyword) {
    return NextResponse.json({ error: "trackedKeyword is required" }, { status: 400 });
  }
  if (!VALID_GRID_SIZES.includes(gridSize)) {
    return NextResponse.json({ error: "gridSize must be 3, 5, or 7" }, { status: 400 });
  }
  if (!(radiusKm > 0) || radiusKm > MAX_RADIUS_KM) {
    return NextResponse.json({ error: `radiusKm must be between 0 and ${MAX_RADIUS_KM}` }, { status: 400 });
  }

  const existing = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return row ?? null;
  });
  if (!existing) {
    return NextResponse.json({ error: "Save a business profile first, on the Profile page." }, { status: 404 });
  }

  const [row] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(localBusinessProfiles)
      .set({ trackedKeyword, gridSize, radiusKm, autoTrackEnabled })
      .where(eq(localBusinessProfiles.projectId, projectId))
      .returning(),
  );

  return NextResponse.json({ profile: row });
});
