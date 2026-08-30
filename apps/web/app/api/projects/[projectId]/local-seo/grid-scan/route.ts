import { NextResponse } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { localBusinessProfiles, localGridScanPoints, localGridScans, withUserContext } from "@rosterseo/db";
import { DataForSeoNotConfiguredError, generateGridPoints, runGridScanPoints } from "@rosterseo/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/local-seo/grid-scan
// Real geo-grid rank check: a keyword checked against DataForSEO's local
// pack at every point in an NxN grid around a center (real
// location_coordinate calls, via the shared runGridScanPoints - see
// @rosterseo/dataforseo). Takes no body: reads keyword/gridSize/radiusKm
// from the project's saved local_business_profiles row (Monitor's config
// row, PATCHed via .../monitor/config) so this exact same real
// orchestration is what the weekly scheduled scan (apps/worker) uses too.
//
// GET lists recent scans with aggregated summary stats (avg position, %
// of points in the top 3 "map pack") for the history list.

type RouteParams = { projectId: string };

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const profile = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return row ?? null;
  });

  if (!profile) {
    return NextResponse.json({ error: "Save a business profile first, on the Profile page." }, { status: 400 });
  }
  if (!profile.trackedKeyword) {
    return NextResponse.json({ error: "Set a tracked keyword in Monitor's config before running a scan." }, { status: 400 });
  }

  const points = generateGridPoints({
    centerLat: profile.lat,
    centerLng: profile.lng,
    gridSize: profile.gridSize,
    radiusKm: profile.radiusKm,
  });
  let checkedPoints;
  try {
    checkedPoints = await runGridScanPoints(profile.trackedKeyword, profile.name, points);
  } catch (err) {
    const message = err instanceof DataForSeoNotConfiguredError ? err.message : "Couldn't run a real grid scan right now. Try again in a moment.";
    console.error("[grid-scan] real scan failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const scan = await withUserContext(session.user.id, async (tx) => {
    const [scanRow] = await tx
      .insert(localGridScans)
      .values({
        projectId,
        keyword: profile.trackedKeyword!,
        centerLat: profile.lat,
        centerLng: profile.lng,
        radiusKm: profile.radiusKm,
        gridSize: profile.gridSize,
      })
      .returning();
    await tx.insert(localGridScanPoints).values(checkedPoints.map((p) => ({ scanId: scanRow!.id, ...p })));
    return scanRow!;
  });

  const found = checkedPoints.filter((p) => p.position !== null).map((p) => p.position!);
  const avgPosition = found.length > 0 ? found.reduce((a, b) => a + b, 0) / found.length : null;
  const pctInTop3 = (checkedPoints.filter((p) => p.position !== null && p.position <= 3).length / checkedPoints.length) * 100;

  return NextResponse.json({ scan, points: checkedPoints, avgPosition, pctInTop3 }, { status: 201 });
});

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const scans = await withUserContext(session.user.id, (tx) =>
    tx.select().from(localGridScans).where(eq(localGridScans.projectId, projectId)).orderBy(desc(localGridScans.createdAt)).limit(50),
  );
  if (scans.length === 0) {
    return NextResponse.json({ scans: [] });
  }

  const summaries = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        scanId: localGridScanPoints.scanId,
        avgPosition: sql<number | null>`AVG(${localGridScanPoints.position})`,
        totalCount: sql<number>`COUNT(*)`,
        top3Count: sql<number>`COUNT(*) FILTER (WHERE ${localGridScanPoints.position} <= 3)`,
      })
      .from(localGridScanPoints)
      .where(
        inArray(
          localGridScanPoints.scanId,
          scans.map((s) => s.id),
        ),
      )
      .groupBy(localGridScanPoints.scanId),
  );
  const summaryByScanId = new Map(summaries.map((s) => [s.scanId, s]));

  return NextResponse.json({
    scans: scans.map((scan) => {
      const summary = summaryByScanId.get(scan.id);
      const totalCount = summary ? Number(summary.totalCount) : 0;
      const avgPosition = summary?.avgPosition != null ? Number(summary.avgPosition) : null;
      const pctInTop3 = totalCount > 0 ? (Number(summary?.top3Count ?? 0) / totalCount) * 100 : 0;
      return { ...scan, avgPosition, pctInTop3 };
    }),
  });
});
