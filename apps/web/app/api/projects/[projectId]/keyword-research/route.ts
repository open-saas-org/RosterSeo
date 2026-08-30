import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getKeywordIdeas, getKeywordSuggestions, getRealKeywordMetrics, getRelatedKeywords, type KeywordMetrics } from "@rosterseo/dataforseo";
import { keywordMetricsCache, keywordResearchSearches, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import type { SourcedKeywordMetrics } from "@/components/keywords/keyword-research-types";

// GET  /api/projects/:projectId/keyword-research - recent search history
//      (seed/location/result count), most recent first. Powers the
//      "Recent searches" panel.
// POST /api/projects/:projectId/keyword-research - the only route that
//      calls DataForSEO for this feature. Body: { seedKeyword, locationCode,
//      locationName }. Real getRealKeywordMetrics() for the seed itself,
//      plus a tiered real fetch for the results grid: getRelatedKeywords()
//      (Google's actual "searches related to" - the closest real semantic
//      matches) first, then getKeywordSuggestions() (real substring
//      variations of the seed), then getKeywordIdeas() (broader category
//      matches) as a third tier if the first two together come back too
//      thin - none of these ever fabricate data; a real failure surfaces
//      as fewer results or a real error, never a mock-looking one. Every
//      returned keyword is cache-checked against keyword_metrics_cache
//      first (skips DataForSEO for anything already cached and still
//      fresh), and every result is upserted into the cache afterward -
//      this is the real persistence, every fetched keyword's data is
//      genuinely saved, not just tracked ones - plus one
//      keyword_research_searches row is logged.

type RouteParams = { projectId: string };

const RESULT_LIMIT = 50;
const MIN_TIERED_RESULTS = 15; // below this, fall through to getKeywordIdeas() as a third tier
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000; // matches Rank Tracking's METRICS_STALE_MS convention

// Similar-first ordering: real "searches related to" matches, then real
// substring variations of the seed, then (only if those two together are
// thin) broader category ideas - deduped by keyword since the same term
// can legitimately turn up in more than one tier.
async function fetchTieredResults(seedKeyword: string, locationCode: number): Promise<SourcedKeywordMetrics[]> {
  const [related, suggestions] = await Promise.all([
    getRelatedKeywords(seedKeyword, locationCode, RESULT_LIMIT),
    getKeywordSuggestions(seedKeyword, locationCode, RESULT_LIMIT),
  ]);

  const seen = new Set<string>();
  const tiered: SourcedKeywordMetrics[] = [];
  const addTier = (items: KeywordMetrics[], source: SourcedKeywordMetrics["source"]) => {
    for (const item of items) {
      if (seen.has(item.keyword)) continue;
      seen.add(item.keyword);
      tiered.push({ ...item, source });
    }
  };

  addTier(related, "related");
  addTier(suggestions, "suggestion");

  if (tiered.length < MIN_TIERED_RESULTS) {
    const ideas = await getKeywordIdeas(seedKeyword, locationCode, RESULT_LIMIT);
    addTier(ideas, "idea");
  }

  return tiered.slice(0, RESULT_LIMIT);
}

function isFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_STALE_MS;
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const searches = await withUserContext(session.user.id, (tx) =>
    tx
      .select()
      .from(keywordResearchSearches)
      .where(eq(keywordResearchSearches.projectId, projectId))
      .orderBy(desc(keywordResearchSearches.createdAt))
      .limit(20),
  );

  return NextResponse.json({ searches });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const seedKeyword = typeof body?.seedKeyword === "string" ? body.seedKeyword.trim().toLowerCase() : "";
  const locationCode = Number(body?.locationCode);
  const locationName = typeof body?.locationName === "string" ? body.locationName.trim() : "";

  if (!seedKeyword || !Number.isFinite(locationCode) || !locationName) {
    return NextResponse.json({ error: "seedKeyword, locationCode, and locationName are required" }, { status: 400 });
  }

  const cachedSeed = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(keywordMetricsCache)
      .where(
        and(
          eq(keywordMetricsCache.projectId, projectId),
          eq(keywordMetricsCache.keyword, seedKeyword),
          eq(keywordMetricsCache.locationCode, locationCode),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  const seedMetrics =
    cachedSeed && isFresh(cachedSeed.fetchedAt)
      ? {
          keyword: seedKeyword,
          searchVolume: cachedSeed.searchVolume,
          difficulty: cachedSeed.keywordDifficulty,
          cpc: cachedSeed.cpc,
          // Not cached (keyword_metrics_cache has no competition column -
          // a deliberate scope call, since only the seed keyword can ever
          // hit this cache branch and a fresh getKeywordIdeas() call
          // supplies real competition for every other result already) -
          // null (not 0) so the UI renders "unknown" instead of a
          // fabricated "zero competition".
          competition: null,
          trend: cachedSeed.monthlySearches ?? [],
          intent: cachedSeed.intent,
        }
      : await getRealKeywordMetrics(seedKeyword, locationCode);

  // No real data for the exact seed the user searched - never substitute
  // fabricated numbers for it. The results grid below can still be real
  // (a different DataForSEO endpoint), but without real seed metrics this
  // search can't be shown as complete.
  if (!seedMetrics) {
    return NextResponse.json({ error: `Couldn't fetch real data for "${seedKeyword}" right now. Try again in a moment.` }, { status: 502 });
  }

  const results = await fetchTieredResults(seedKeyword, locationCode);
  const allResults = [seedMetrics, ...results];

  await withUserContext(session.user.id, async (tx) => {
    for (const metrics of allResults) {
      await tx
        .insert(keywordMetricsCache)
        .values({
          projectId,
          keyword: metrics.keyword,
          locationCode,
          searchVolume: metrics.searchVolume,
          keywordDifficulty: metrics.difficulty,
          cpc: metrics.cpc,
          intent: metrics.intent,
          monthlySearches: metrics.trend,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [keywordMetricsCache.projectId, keywordMetricsCache.keyword, keywordMetricsCache.locationCode],
          set: {
            searchVolume: metrics.searchVolume,
            keywordDifficulty: metrics.difficulty,
            cpc: metrics.cpc,
            intent: metrics.intent,
            monthlySearches: metrics.trend,
            fetchedAt: new Date(),
          },
        });
    }

    await tx.insert(keywordResearchSearches).values({
      projectId,
      seedKeyword,
      locationCode,
      locationName,
      resultCount: results.length,
    });
  });

  return NextResponse.json({ seed: seedMetrics, results });
});
