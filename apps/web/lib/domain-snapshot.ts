import { and, eq } from "drizzle-orm";
import { competitorSnapshotCache, withUserContext } from "@rosterseo/db";
import { getBacklinksOverview, getDomainOverview, type BacklinksOverview, type DomainOverview } from "@rosterseo/dataforseo";

export type DomainSnapshot = {
  domain: string;
  estimatedMonthlyTraffic: number;
  organicKeywords: number;
  totalBacklinks: number;
  referringDomains: number;
  domainRating: number;
};

// Same 7-day staleness window as fetchCompetitorSnapshot below shares with.
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_STALE_MS;
}

function rowToSnapshot(row: typeof competitorSnapshotCache.$inferSelect): DomainSnapshot {
  return {
    domain: row.domain,
    estimatedMonthlyTraffic: row.estimatedMonthlyTraffic,
    organicKeywords: row.organicKeywords,
    totalBacklinks: row.totalBacklinks,
    referringDomains: row.referringDomains,
    domainRating: row.domainRating,
  };
}

// Shared read-through cache over `competitor_snapshot_cache`
// (packages/db/src/app-schema.ts), keyed by (project, domain, location) -
// the exact same table and staleness window the Competitors page's
// fetchCompetitorSnapshot (apps/web/app/(dashboard)/competitors/actions.ts)
// already reads/writes. Extracted here as a plain function (not a "use
// server" action) so callers with no live Next.js request context - e.g.
// Page Analyzer's fire-and-forget background pipeline, which keeps running
// after the request that spawned it has already responded and can't rely
// on headers()/cookies() being available - can resolve a domain's real
// authority/traffic numbers from a plain userId/projectId/domain, no
// session lookup required. A fetch from either call site keeps the other's
// cache fresh, since both read and write the same rows.
//
// Deliberately narrower than fetchCompetitorSnapshot: no ranked_keywords
// call (that's specific to the Competitors page's own "keyword ideas"
// list, not needed just to size up a domain's authority) and no
// "previous" snapshot diffing returned to the caller - though the columns
// are still carried forward on write so a later Competitors-page visit's
// own "vs last check" delta isn't broken by a Page Analyzer refresh.
export async function resolveDomainSnapshot(
  userId: string,
  projectId: string,
  domain: string,
  locationCode: number,
): Promise<DomainSnapshot | null> {
  const cached = await withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(competitorSnapshotCache)
      .where(
        and(
          eq(competitorSnapshotCache.projectId, projectId),
          eq(competitorSnapshotCache.domain, domain),
          eq(competitorSnapshotCache.locationCode, locationCode),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  if (cached && isFresh(cached.fetchedAt)) {
    return rowToSnapshot(cached);
  }

  let overview: DomainOverview;
  let backlinks: BacklinksOverview;
  try {
    [overview, backlinks] = await Promise.all([getDomainOverview(domain, locationCode), getBacklinksOverview(domain)]);
  } catch (err) {
    console.error(`[domain-snapshot] real lookup failed for ${domain}:`, err);
    // A stale cached row is still real data, just older than 7 days -
    // better to show that than nothing when the live call fails.
    return cached ? rowToSnapshot(cached) : null;
  }

  await withUserContext(userId, (tx) =>
    tx
      .insert(competitorSnapshotCache)
      .values({
        projectId,
        domain,
        locationCode,
        estimatedMonthlyTraffic: overview.estimatedMonthlyTraffic,
        organicKeywords: overview.organicKeywords,
        topPages: overview.topPages,
        totalBacklinks: backlinks.totalBacklinks,
        referringDomains: backlinks.referringDomains,
        domainRating: backlinks.domainRating,
        keywordIdeas: cached?.keywordIdeas ?? [],
        previousEstimatedMonthlyTraffic: cached?.estimatedMonthlyTraffic,
        previousOrganicKeywords: cached?.organicKeywords,
        previousTotalBacklinks: cached?.totalBacklinks,
        previousReferringDomains: cached?.referringDomains,
        previousDomainRating: cached?.domainRating,
        previousFetchedAt: cached?.fetchedAt,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [competitorSnapshotCache.projectId, competitorSnapshotCache.domain, competitorSnapshotCache.locationCode],
        set: {
          // keywordIdeas deliberately omitted - preserves whatever the
          // Competitors page's own richer fetch already stored there.
          estimatedMonthlyTraffic: overview.estimatedMonthlyTraffic,
          organicKeywords: overview.organicKeywords,
          topPages: overview.topPages,
          totalBacklinks: backlinks.totalBacklinks,
          referringDomains: backlinks.referringDomains,
          domainRating: backlinks.domainRating,
          previousEstimatedMonthlyTraffic: cached?.estimatedMonthlyTraffic,
          previousOrganicKeywords: cached?.organicKeywords,
          previousTotalBacklinks: cached?.totalBacklinks,
          previousReferringDomains: cached?.referringDomains,
          previousDomainRating: cached?.domainRating,
          previousFetchedAt: cached?.fetchedAt,
          fetchedAt: new Date(),
        },
      }),
  );

  return {
    domain,
    estimatedMonthlyTraffic: overview.estimatedMonthlyTraffic,
    organicKeywords: overview.organicKeywords,
    totalBacklinks: backlinks.totalBacklinks,
    referringDomains: backlinks.referringDomains,
    domainRating: backlinks.domainRating,
  };
}
