import { and, eq, gte, inArray } from "drizzle-orm";
import { db, socialConnections, socialPostMetrics, socialPostTargets, user, withUserContext } from "@rosterseo/db";
import { getSocialAdapter } from "@rosterseo/social";
import { socialMetricsFetchJob } from "@rosterseo/jobs";

// Only platforms with a real fetchMetrics() implementation
// (PUBLISHING_PLATFORM_PRD.md §3's chosen first phase) - every other
// connected platform is silently skipped by the fanout below, same "an
// adapter without this method just doesn't run" contract the type itself
// documents.
const METRICS_CAPABLE_PLATFORMS = ["facebook_page", "instagram", "linkedin"];

// Only re-check posts published within this window - engagement on an
// old post is effectively frozen, and this keeps the daily fanout's
// workload bounded rather than growing forever with every post this app
// has ever published.
const METRICS_LOOKBACK_DAYS = 90;

// Weekly/daily fan-out jobs in this codebase can't query across tenants
// directly (organizations/organization_members FORCE ROW LEVEL SECURITY,
// which blocks even the worker's own queries with no user context set) -
// same worked-around-by-design pattern as Local SEO's runWeeklyFanout
// (apps/worker/src/features/grid-scan-runner.ts): list every real user id
// from the unprotected auth `user` table, then run one RLS-scoped query
// per user to find that user's own eligible targets. Never a privilege
// bypass - every actual data read still goes through withUserContext.
export async function runSocialMetricsFanout(): Promise<void> {
  const users = await db.select({ id: user.id }).from(user);
  const cutoff = new Date(Date.now() - METRICS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const seenTargetIds = new Set<string>();

  for (const { id: userId } of users) {
    const targets = await withUserContext(userId, (tx) =>
      tx
        .select({ id: socialPostTargets.id })
        .from(socialPostTargets)
        .innerJoin(socialConnections, eq(socialConnections.id, socialPostTargets.socialConnectionId))
        .where(
          and(
            eq(socialPostTargets.status, "published"),
            inArray(socialConnections.platform, METRICS_CAPABLE_PLATFORMS),
            gte(socialPostTargets.publishedAt, cutoff),
          ),
        ),
    );

    for (const { id: socialPostTargetId } of targets) {
      if (seenTargetIds.has(socialPostTargetId)) continue;
      seenTargetIds.add(socialPostTargetId);
      await socialMetricsFetchJob.enqueue({ socialPostTargetId, userId });
    }
  }
}

// Processes one target: fetches its platform's real current metrics and
// appends a new snapshot row (never updates one in place - see
// social_post_metrics' own schema comment on why this is a log, not an
// upsert).
export async function runFetchSocialMetrics(payload: { socialPostTargetId: string; userId: string }): Promise<void> {
  const { socialPostTargetId, userId } = payload;

  const target = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(socialPostTargets).where(eq(socialPostTargets.id, socialPostTargetId)).limit(1);
    return row ?? null;
  });
  if (!target || !target.remotePostId) {
    console.log(`[social-metrics] target ${socialPostTargetId} has no remotePostId yet - skipping`);
    return;
  }

  const connection = await withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(socialConnections).where(eq(socialConnections.id, target.socialConnectionId)).limit(1);
    return row ?? null;
  });
  if (!connection) {
    console.log(`[social-metrics] connection for target ${socialPostTargetId} was disconnected - skipping`);
    return;
  }

  const adapter = getSocialAdapter(connection.platform);
  if (!adapter?.fetchMetrics) {
    console.log(`[social-metrics] no fetchMetrics for platform "${connection.platform}" - skipping`);
    return;
  }

  try {
    // NOTE: connection.credentials is read here the same way
    // social-publish-runner.ts already does - not yet routed through the
    // credential-encryption helper (packages/db/src/crypto.ts) a parallel
    // task in this session is wiring up separately. Update this call site
    // too once that lands.
    const metrics = await adapter.fetchMetrics(connection.credentials, target.remotePostId);
    await withUserContext(userId, (tx) =>
      tx.insert(socialPostMetrics).values({
        projectId: target.projectId,
        socialPostTargetId,
        platform: connection.platform,
        ...metrics,
      }),
    );
  } catch (err) {
    console.error(`[social-metrics] fetch failed for target ${socialPostTargetId}`, err);
  }
}
