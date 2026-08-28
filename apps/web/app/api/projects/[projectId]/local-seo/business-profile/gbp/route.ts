import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, localBusinessProfiles, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";

// GET   /api/projects/:projectId/local-seo/business-profile/gbp - real gbp
//       connection status + whichever location is linked, if any
// PATCH /api/projects/:projectId/local-seo/business-profile/gbp
//       body: { accountId, locationId, locationName } - links a real GBP
//       location to this project's local_business_profiles row, picked
//       from accounts/route.ts + locations/route.ts's already-fetched
//       real lists (no Google call here, same division of labor as
//       PATCH .../integrations).
// DELETE unlinks (keeps the DataForSEO-sourced profile fields untouched).
//
// Requires a local_business_profiles row to already exist (Profile page's
// search-and-pick flow) - this only ever adds the optional Performance
// link on top of it, never creates the row itself.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [conn, profile] = await withUserContext(session.user.id, async (tx) => {
    const [c] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "gbp")))
      .limit(1);
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return [c ?? null, row ?? null];
  });

  return NextResponse.json({
    connection: toConnectionStatus(conn ?? undefined, null, "gbp"),
    hasProfile: profile !== null,
    gbpAccountId: profile?.gbpAccountId ?? null,
    gbpLocationId: profile?.gbpLocationId ?? null,
    gbpLocationName: profile?.gbpLocationName ?? null,
  });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
  const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : "";
  const locationName = typeof body?.locationName === "string" ? body.locationName.trim() : "";
  if (!accountId || !locationId || !locationName) {
    return NextResponse.json({ error: "accountId, locationId, and locationName are required" }, { status: 400 });
  }

  const existing = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select({ projectId: localBusinessProfiles.projectId }).from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return row ?? null;
  });
  if (!existing) {
    return NextResponse.json({ error: "Save a business profile first, on the Profile page." }, { status: 400 });
  }

  const [row] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(localBusinessProfiles)
      .set({ gbpAccountId: accountId, gbpLocationId: locationId, gbpLocationName: locationName })
      .where(eq(localBusinessProfiles.projectId, projectId))
      .returning(),
  );

  return NextResponse.json({
    gbpAccountId: row!.gbpAccountId,
    gbpLocationId: row!.gbpLocationId,
    gbpLocationName: row!.gbpLocationName,
  });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await withUserContext(session.user.id, (tx) =>
    tx
      .update(localBusinessProfiles)
      .set({ gbpAccountId: null, gbpLocationId: null, gbpLocationName: null })
      .where(eq(localBusinessProfiles.projectId, projectId)),
  );

  return NextResponse.json({ ok: true });
});
