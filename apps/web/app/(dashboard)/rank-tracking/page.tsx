import { desc, eq, inArray } from "drizzle-orm";
import { resolveLocationCode } from "@rosterseo/dataforseo";
import { keywordRankings, rankCheckRuns, rankTrackingSettings, trackedKeywords, withUserContext } from "@rosterseo/db";
import { RankTrackingWorkspace } from "@/components/rank-tracking/rank-tracking-workspace";
import { getCurrentProject } from "@/lib/current-project";
import type { RankTrackingSettings, TrackedKeyword } from "@/components/keywords/rank-tracking-types";

export default async function RankTrackingPage() {
  const { session, project } = await getCurrentProject();

  const { settingsRow, latestRun, rows, rankingsByKeywordId } = await withUserContext(session.user.id, async (tx) => {
    let settings = (
      await tx.select().from(rankTrackingSettings).where(eq(rankTrackingSettings.projectId, project.id)).limit(1)
    )[0];
    if (!settings) {
      const locationCode = await resolveLocationCode(project.targetLocation ?? undefined);
      [settings] = await tx
        .insert(rankTrackingSettings)
        .values({ projectId: project.id, locationCode, locationName: project.targetLocation ?? "United States" })
        .returning();
    }

    const [run] = await tx
      .select()
      .from(rankCheckRuns)
      .where(eq(rankCheckRuns.projectId, project.id))
      .orderBy(desc(rankCheckRuns.startedAt))
      .limit(1);

    const trackedRows = await tx
      .select()
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, project.id))
      .orderBy(desc(trackedKeywords.createdAt));

    const rankings =
      trackedRows.length === 0
        ? []
        : await tx
            .select()
            .from(keywordRankings)
            .where(
              inArray(
                keywordRankings.trackedKeywordId,
                trackedRows.map((r) => r.id),
              ),
            )
            .orderBy(desc(keywordRankings.checkedAt));

    // Latest two snapshots per keyword (current + previous, for the
    // position-delta arrow) - keeping the whole history client-side isn't
    // needed anymore now that the portfolio-wide trend lives in the
    // position-distribution chart instead of a per-row sparkline.
    const byId = new Map<string, typeof rankings>();
    for (const ranking of rankings) {
      const list = byId.get(ranking.trackedKeywordId) ?? [];
      if (list.length < 2) list.push(ranking);
      byId.set(ranking.trackedKeywordId, list);
    }

    return { settingsRow: settings!, latestRun: run ?? null, rows: trackedRows, rankingsByKeywordId: byId };
  });

  const initialSettings: RankTrackingSettings = {
    locationCode: settingsRow.locationCode,
    locationName: settingsRow.locationName,
    device: settingsRow.device === "mobile" ? "mobile" : "desktop",
    scheduleInterval: settingsRow.scheduleInterval === "weekly" ? "weekly" : "manual",
  };

  const initialTracked: TrackedKeyword[] = rows.map((row) => {
    const [current, previous] = rankingsByKeywordId.get(row.id) ?? [];
    return {
      id: row.id,
      keyword: row.keyword,
      searchVolume: row.searchVolume,
      keywordDifficulty: row.keywordDifficulty,
      cpc: row.cpc,
      metricsFetchedAt: row.metricsFetchedAt ? row.metricsFetchedAt.toISOString() : null,
      currentPosition: current?.position ?? null,
      currentUrl: current?.url ?? null,
      previousPosition: previous?.position ?? null,
      serpFeatures: current?.serpFeatures ?? [],
      checkedAt: current ? current.checkedAt.toISOString() : null,
      addedAt: row.createdAt.toISOString(),
      isMock: current?.isMock ?? false,
    };
  });

  const initialRunId = latestRun && (latestRun.status === "pending" || latestRun.status === "running") ? latestRun.id : null;

  return (
    <div className="flex flex-col gap-4">
      <RankTrackingWorkspace
        projectId={project.id}
        domain={project.domain}
        initialSettings={initialSettings}
        initialTracked={initialTracked}
        initialRunId={initialRunId}
      />
    </div>
  );
}
