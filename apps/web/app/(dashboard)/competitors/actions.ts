"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { competitorSnapshotCache, withUserContext } from "@seo-tool/db";
import {
  getBacklinksOverview,
  getDomainOverview,
  getRankedKeywords,
  resolveLocationCode,
  type BacklinksOverview,
  type DomainOverview,
  type KeywordMetrics,
} from "@seo-tool/dataforseo";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

export type PreviousCompetitorSnapshot = {
  estimatedMonthlyTraffic: number;
  organicKeywords: number;
  totalBacklinks: number;
  referringDomains: number;
  domainRating: number;
  fetchedAt: string;
};

export type CompetitorSnapshot = {
  domain: string;
  overview: DomainOverview;
  backlinks: BacklinksOverview;
  // Real keywords this domain actually ranks for (DataForSEO Labs
  // ranked_keywords), not a content/keyword-gap analysis against your own
  // site - that would need a second domain to diff against.
  keywordIdeas: KeywordMetrics[];
  // This same snapshot's values from before the most recent refresh - the
  // real "vs last check" comparison the Competitors page shows. Null until
  // this domain has been refreshed at least twice (a brand-new competitor
  // has nothing real to compare against yet).
  previous: PreviousCompetitorSnapshot | null;
};

// Same 7-day staleness window as Backlinks/Keyword Research's caches.
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_STALE_MS;
}

// Project-scoped fetch-or-cache, same shape as Backlinks'
// fetchBacklinksOverview (app/(dashboard)/backlinks/actions.ts). Used to be
// a pure DataForSEO passthrough with no DB touch at all - every visit to
// the Competitors page re-fetched domain overview + backlinks overview +
// ranked keywords (~4 real requests) for every tracked competitor, live,
// every time. Now cached per (project, domain, location) for 7 days.
export async function fetchCompetitorSnapshot(projectId: string, rawDomain: string, targetLocation?: string): Promise<CompetitorSnapshot> {
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) {
    throw new Error(`"${rawDomain}" doesn't look like a valid domain.`);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Not signed in.");
  }
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    throw new Error("Project not found.");
  }

  const locationCode = await resolveLocationCode(targetLocation);

  const cached = await withUserContext(session.user.id, async (tx) => {
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
    return snapshotFromRow(cached);
  }

  const [overview, backlinks, keywordIdeas] = await Promise.all([
    getDomainOverview(domain, locationCode),
    getBacklinksOverview(domain),
    getRankedKeywords(domain, 8, locationCode),
  ]);

  // The row being replaced is itself the real "previous" data point - not
  // computed, just carried forward one refresh at a time.
  const previous: PreviousCompetitorSnapshot | null = cached
    ? {
        estimatedMonthlyTraffic: cached.estimatedMonthlyTraffic,
        organicKeywords: cached.organicKeywords,
        totalBacklinks: cached.totalBacklinks,
        referringDomains: cached.referringDomains,
        domainRating: cached.domainRating,
        fetchedAt: cached.fetchedAt.toISOString(),
      }
    : null;

  await withUserContext(session.user.id, (tx) =>
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
        keywordIdeas,
        previousEstimatedMonthlyTraffic: previous?.estimatedMonthlyTraffic,
        previousOrganicKeywords: previous?.organicKeywords,
        previousTotalBacklinks: previous?.totalBacklinks,
        previousReferringDomains: previous?.referringDomains,
        previousDomainRating: previous?.domainRating,
        previousFetchedAt: cached?.fetchedAt,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [competitorSnapshotCache.projectId, competitorSnapshotCache.domain, competitorSnapshotCache.locationCode],
        set: {
          estimatedMonthlyTraffic: overview.estimatedMonthlyTraffic,
          organicKeywords: overview.organicKeywords,
          topPages: overview.topPages,
          totalBacklinks: backlinks.totalBacklinks,
          referringDomains: backlinks.referringDomains,
          domainRating: backlinks.domainRating,
          keywordIdeas,
          previousEstimatedMonthlyTraffic: previous?.estimatedMonthlyTraffic,
          previousOrganicKeywords: previous?.organicKeywords,
          previousTotalBacklinks: previous?.totalBacklinks,
          previousReferringDomains: previous?.referringDomains,
          previousDomainRating: previous?.domainRating,
          previousFetchedAt: cached?.fetchedAt,
          fetchedAt: new Date(),
        },
      }),
  );

  return {
    domain,
    overview,
    backlinks,
    keywordIdeas,
    previous,
  };
}

function previousFromRow(row: typeof competitorSnapshotCache.$inferSelect): PreviousCompetitorSnapshot | null {
  if (!row.previousFetchedAt) return null;
  return {
    estimatedMonthlyTraffic: row.previousEstimatedMonthlyTraffic ?? 0,
    organicKeywords: row.previousOrganicKeywords ?? 0,
    totalBacklinks: row.previousTotalBacklinks ?? 0,
    referringDomains: row.previousReferringDomains ?? 0,
    domainRating: row.previousDomainRating ?? 0,
    fetchedAt: row.previousFetchedAt.toISOString(),
  };
}

function snapshotFromRow(row: typeof competitorSnapshotCache.$inferSelect): CompetitorSnapshot {
  return {
    domain: row.domain,
    overview: {
      domain: row.domain,
      estimatedMonthlyTraffic: row.estimatedMonthlyTraffic,
      organicKeywords: row.organicKeywords,
      topPages: row.topPages ?? [],
    },
    backlinks: { domain: row.domain, totalBacklinks: row.totalBacklinks, referringDomains: row.referringDomains, domainRating: row.domainRating },
    keywordIdeas: row.keywordIdeas ?? [],
    previous: previousFromRow(row),
  };
}

// Real, already-scanned data for every tracked competitor in a project,
// read straight from the cache - no DataForSEO call, however stale the
// row is (staleness only governs whether pressing Scan re-fetches live;
// it doesn't hide already-real data on page load). This is what lets a
// scanned competitor's numbers survive a refresh instead of reverting to
// "not scanned yet" every time the Competitors page (re)loads.
export async function getCachedSnapshots(userId: string, projectId: string, locationCode: number): Promise<Map<string, CompetitorSnapshot>> {
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(competitorSnapshotCache)
      .where(and(eq(competitorSnapshotCache.projectId, projectId), eq(competitorSnapshotCache.locationCode, locationCode))),
  );
  return new Map(rows.map((row) => [row.domain, snapshotFromRow(row)]));
}
