"use server";

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { backlinksCache, withUserContext } from "@rosterseo/db";
import { getBacklinksList, getBacklinksOverview, type BacklinkItem, type BacklinksOverview } from "@rosterseo/dataforseo";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

export type BacklinksOverviewResult = {
  overview: BacklinksOverview;
  backlinks: BacklinkItem[];
  fromCache: boolean;
};

// Matches Keyword Research's keywordMetricsCache convention (7 days).
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_STALE_MS;
}

// Project-scoped now (was a pure unscoped domain -> stats lookup before) so
// a repeat search for the same domain can be served from backlinksCache
// instead of re-hitting DataForSEO every time, and past lookups survive as
// real history instead of vanishing the moment the page unmounts.
export async function fetchBacklinksOverview(projectId: string, rawDomain: string): Promise<BacklinksOverviewResult> {
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

  const cached = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(backlinksCache)
      .where(and(eq(backlinksCache.projectId, projectId), eq(backlinksCache.domain, domain)))
      .limit(1);
    return row ?? null;
  });

  if (cached && isFresh(cached.fetchedAt)) {
    return {
      overview: { domain, totalBacklinks: cached.totalBacklinks, referringDomains: cached.referringDomains, domainRating: cached.domainRating },
      backlinks: cached.topBacklinks ?? [],
      fromCache: true,
    };
  }

  const [overview, backlinks] = await Promise.all([getBacklinksOverview(domain), getBacklinksList(domain)]);

  await withUserContext(session.user.id, (tx) =>
    tx
      .insert(backlinksCache)
      .values({
        projectId,
        domain,
        totalBacklinks: overview.totalBacklinks,
        referringDomains: overview.referringDomains,
        domainRating: overview.domainRating,
        topBacklinks: backlinks,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [backlinksCache.projectId, backlinksCache.domain],
        set: {
          totalBacklinks: overview.totalBacklinks,
          referringDomains: overview.referringDomains,
          domainRating: overview.domainRating,
          topBacklinks: backlinks,
          fetchedAt: new Date(),
        },
      }),
  );

  return { overview, backlinks, fromCache: false };
}
