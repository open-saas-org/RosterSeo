import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveLocationCode } from "@rosterseo/dataforseo";
import { projects, rankTrackingSettings, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET   /api/projects/:projectId/rank-tracking/settings - the project-wide
//       location/device/schedule config Rank Tracking's Fetch Rankings
//       action reads. Lazily created with a sensible default (resolved
//       from the project's own free-text targetLocation) the first time
//       this is requested with no row yet.
// PATCH body: { locationCode, locationName, device, scheduleInterval } -
//       upserts. "weekly" is accepted and stored but not yet automatic -
//       there's no recurring job reading it this pass.

type RouteParams = { projectId: string };

async function loadOrCreateSettings(projectId: string, userId: string) {
  return withUserContext(userId, async (tx) => {
    const [existing] = await tx.select().from(rankTrackingSettings).where(eq(rankTrackingSettings.projectId, projectId)).limit(1);
    if (existing) return existing;

    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const locationCode = await resolveLocationCode(project?.targetLocation ?? undefined);
    const [created] = await tx
      .insert(rankTrackingSettings)
      .values({ projectId, locationCode, locationName: project?.targetLocation ?? "United States" })
      .returning();
    return created;
  });
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const settings = await loadOrCreateSettings(projectId, session.user.id);
  return NextResponse.json({ settings });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const locationCode = Number(body?.locationCode);
  const locationName = typeof body?.locationName === "string" ? body.locationName.trim() : "";
  const device = body?.device === "mobile" ? "mobile" : "desktop";
  const scheduleInterval = body?.scheduleInterval === "weekly" ? "weekly" : "manual";

  if (!Number.isFinite(locationCode) || !locationName) {
    return NextResponse.json({ error: "locationCode and locationName are required" }, { status: 400 });
  }

  await loadOrCreateSettings(projectId, session.user.id);

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(rankTrackingSettings)
      .set({ locationCode, locationName, device, scheduleInterval, updatedAt: new Date() })
      .where(eq(rankTrackingSettings.projectId, projectId))
      .returning(),
  );

  return NextResponse.json({ settings: updated });
});
