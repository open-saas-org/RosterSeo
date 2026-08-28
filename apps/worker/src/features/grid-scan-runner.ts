import { and, eq, isNotNull } from "drizzle-orm";
import { db, user, projects, localBusinessProfiles, localGridScans, localGridScanPoints, withUserContext } from "@seo-tool/db";
import { generateGridPoints, runGridScanPoints } from "@seo-tool/dataforseo";
import { localGridScanJob } from "@seo-tool/jobs";

// Runs one project's geo-grid scan and persists it - the same real
// DataForSEO orchestration (runGridScanPoints) the on-demand
// POST .../grid-scan route uses, so a scheduled scan and a manual "Run
// now" scan behave identically. Reads config straight from
// local_business_profiles rather than taking parameters, since that's the
// single source of truth both the UI and the scheduler write to.
export async function runProjectGridScan(projectId: string, userId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    const [profile] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId));
    // Not configured (or a race with the fanout query below) - skip
    // silently rather than throw, this isn't a user-facing request.
    if (!profile || !profile.trackedKeyword) return;

    const points = generateGridPoints({
      centerLat: profile.lat,
      centerLng: profile.lng,
      gridSize: profile.gridSize,
      radiusKm: profile.radiusKm,
    });
    const checkedPoints = await runGridScanPoints(profile.trackedKeyword, profile.name, points);

    const [scanRow] = await tx
      .insert(localGridScans)
      .values({
        projectId,
        keyword: profile.trackedKeyword,
        centerLat: profile.lat,
        centerLng: profile.lng,
        radiusKm: profile.radiusKm,
        gridSize: profile.gridSize,
      })
      .returning();
    await tx.insert(localGridScanPoints).values(checkedPoints.map((p) => ({ scanId: scanRow!.id, ...p })));
  });
}

// The weekly cron entrypoint. `projects`/`organization_members` have
// FORCE ROW LEVEL SECURITY (see packages/db/drizzle/0001_rls_policies.sql)
// specifically so no role - including this worker's - can read across
// every tenant at once. The `user` auth table is the one documented
// exception (unprotected, since auth needs to look up a user before any
// request context exists), so this lists user ids from there, then runs
// one withUserContext(userId, ...) query per user to find THAT user's own
// projects with tracking enabled - never a cross-tenant query.
//
// organization_members has no one-user-per-org constraint, so two
// teammates in the same org would otherwise both match the same project
// and enqueue it twice (double DataForSEO spend, duplicate weekly scan
// rows) - seenProjectIds dedupes across the whole run.
export async function runWeeklyFanout(): Promise<void> {
  const users = await db.select({ id: user.id }).from(user);
  const seenProjectIds = new Set<string>();

  for (const { id: userId } of users) {
    const matches = await withUserContext(userId, (tx) =>
      tx
        .select({ projectId: projects.id })
        .from(projects)
        .innerJoin(localBusinessProfiles, eq(localBusinessProfiles.projectId, projects.id))
        .where(and(eq(localBusinessProfiles.autoTrackEnabled, true), isNotNull(localBusinessProfiles.trackedKeyword))),
    );

    for (const { projectId } of matches) {
      if (seenProjectIds.has(projectId)) continue;
      seenProjectIds.add(projectId);
      await localGridScanJob.enqueue({ projectId, userId });
    }
  }
}

