import { desc, eq, inArray, sql } from "drizzle-orm";
import { localBusinessProfiles, localGridScanPoints, localGridScans, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { MonitorWorkspace } from "@/components/local-seo/monitor-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function MonitorPage() {
  const { session, project } = await getCurrentProject();

  const [profile, scans] = await Promise.all([
    withUserContext(session.user.id, async (tx) => {
      const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, project.id)).limit(1);
      return row ?? null;
    }),
    withUserContext(session.user.id, (tx) =>
      tx.select().from(localGridScans).where(eq(localGridScans.projectId, project.id)).orderBy(desc(localGridScans.createdAt)).limit(50),
    ),
  ]);

  let summaryByScanId = new Map<string, { avgPosition: number | null; pctInTop3: number }>();
  if (scans.length > 0) {
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
    summaryByScanId = new Map(
      summaries.map((s) => [
        s.scanId,
        {
          avgPosition: s.avgPosition != null ? Number(s.avgPosition) : null,
          pctInTop3: Number(s.totalCount) > 0 ? (Number(s.top3Count) / Number(s.totalCount)) * 100 : 0,
        },
      ]),
    );
  }

  const initialScans = scans.map((scan) => ({
    id: scan.id,
    keyword: scan.keyword,
    gridSize: scan.gridSize,
    radiusKm: scan.radiusKm,
    createdAt: scan.createdAt.toISOString(),
    avgPosition: summaryByScanId.get(scan.id)?.avgPosition ?? null,
    pctInTop3: summaryByScanId.get(scan.id)?.pctInTop3 ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Monitor" description={`Real Google local-pack rank across a grid of points around ${project.name}, tracked weekly.`} />
      <MonitorWorkspace
        projectId={project.id}
        hasProfile={profile !== null}
        initialConfig={
          profile
            ? { trackedKeyword: profile.trackedKeyword, gridSize: profile.gridSize, radiusKm: profile.radiusKm, autoTrackEnabled: profile.autoTrackEnabled }
            : null
        }
        initialScans={initialScans}
      />
    </div>
  );
}
