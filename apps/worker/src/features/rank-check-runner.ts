import { eq, inArray } from "drizzle-orm";
import { checkKeywordRanking, getRealKeywordMetrics, type KeywordMetrics } from "@rosterseo/dataforseo";
import { keywordRankings, projects, rankCheckRuns, rankTrackingSettings, trackedKeywords, withUserContext } from "@rosterseo/db";

// Mirrors apps/web/components/competitors/domain-utils.ts's normalizeDomain
// - duplicated rather than imported since apps/worker can't reach into
// apps/web's `@/` path aliases across app boundaries. Keep in sync if that
// one ever changes.
function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/^www\./, "");
  return value;
}

const METRICS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

// Processes one bulk "Fetch Rankings" run: real DataForSEO SERP check per
// keyword (checkKeywordRanking), refreshing cached volume/KD/CPC
// (getKeywordMetrics) only when stale/missing, writing one keyword_rankings
// row per keyword with this run's id (so the position-distribution chart
// can group by real check runs). One keyword's failure doesn't abort the
// run - it's logged and skipped, same resilience as Site Audit's per-page
// write handling.
export async function runRankCheck(payload: { runId: string; projectId: string; userId: string; keywordIds: string[] }) {
  const { runId, projectId, userId, keywordIds } = payload;

  try {
    await withUserContext(userId, (tx) => tx.update(rankCheckRuns).set({ status: "running" }).where(eq(rankCheckRuns.id, runId)));

    const { settings, project, keywords, alreadyCheckedIds } = await withUserContext(userId, async (tx) => {
      const [settingsRow] = await tx.select().from(rankTrackingSettings).where(eq(rankTrackingSettings.projectId, projectId)).limit(1);
      const [projectRow] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const keywordRows = keywordIds.length > 0 ? await tx.select().from(trackedKeywords).where(inArray(trackedKeywords.id, keywordIds)) : [];
      // A pg-boss retry of this exact job re-delivers the same runId - any
      // keyword that already has a row under this run (from a prior
      // partial attempt) must NOT be re-checked, or it gets double-counted
      // in the position-distribution chart. This is what actually makes a
      // retry safe, not just the per-keyword try/catch below.
      const existingRows =
        keywordIds.length > 0 ? await tx.select({ trackedKeywordId: keywordRankings.trackedKeywordId }).from(keywordRankings).where(eq(keywordRankings.runId, runId)) : [];
      return {
        settings: settingsRow ?? null,
        project: projectRow ?? null,
        keywords: keywordRows,
        alreadyCheckedIds: new Set(existingRows.map((r) => r.trackedKeywordId)),
      };
    });

    if (!settings || !project) {
      throw new Error(`Missing rank tracking settings or project for project ${projectId}`);
    }

    const projectDomain = normalizeDomain(project.domain);
    const device = settings.device === "mobile" ? "mobile" : "desktop";

    let checked = alreadyCheckedIds.size;
    for (const kw of keywords) {
      if (alreadyCheckedIds.has(kw.id)) continue;

      try {
        const { organicResults, serpFeatures, isMock } = await checkKeywordRanking(kw.keyword, settings.locationCode, device);
        const match = organicResults.find((r) => normalizeDomain(r.domain) === projectDomain);
        const position = match?.position ?? null;
        const url = match?.url ?? null;

        const needsMetricsRefresh = !kw.metricsFetchedAt || Date.now() - kw.metricsFetchedAt.getTime() > METRICS_STALE_MS;
        let metrics: KeywordMetrics | null = null;
        if (needsMetricsRefresh) {
          // Real metrics only - never overwrite a tracked keyword's real
          // volume/difficulty/CPC with fabricated numbers on a DataForSEO
          // hiccup. A refresh that can't get real data just stays stale
          // until the next successful run instead.
          metrics = await getRealKeywordMetrics(kw.keyword, settings.locationCode).catch((metricsErr) => {
            console.error(`[rank-check] metrics refresh failed for "${kw.keyword}"`, metricsErr);
            return null;
          });
        }

        await withUserContext(userId, async (tx) => {
          await tx.insert(keywordRankings).values({ trackedKeywordId: kw.id, position, url, runId, device, serpFeatures, isMock });
          if (metrics) {
            await tx
              .update(trackedKeywords)
              .set({
                searchVolume: metrics.searchVolume,
                keywordDifficulty: metrics.difficulty,
                cpc: metrics.cpc,
                metricsFetchedAt: new Date(),
              })
              .where(eq(trackedKeywords.id, kw.id));
          }
        });

        checked += 1;
        await withUserContext(userId, (tx) => tx.update(rankCheckRuns).set({ keywordsChecked: checked }).where(eq(rankCheckRuns.id, runId)));
      } catch (err) {
        // A single keyword's DataForSEO failure shouldn't sink the whole
        // run - log and move on, same reasoning as Site Audit's per-page
        // write error handling. The progress-counter update lives inside
        // this same try/catch (not after it) so a transient failure here
        // can't escape to the outer catch and fail the whole run/trigger a
        // pg-boss retry that would re-process already-successful keywords.
        console.error(`[rank-check] check failed for keyword "${kw.keyword}"`, err);
      }
    }

    await withUserContext(userId, (tx) =>
      tx.update(rankCheckRuns).set({ status: "completed", completedAt: new Date() }).where(eq(rankCheckRuns.id, runId)),
    );
  } catch (error) {
    console.error("[rank-check] run failed", runId, error);
    await withUserContext(userId, (tx) =>
      tx
        .update(rankCheckRuns)
        .set({ status: "failed", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error) })
        .where(eq(rankCheckRuns.id, runId)),
    );
    throw error;
  }
}
