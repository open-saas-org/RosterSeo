import { and, eq, sql } from "drizzle-orm";
import { organizations, usageCounters, withUserContext } from "@rosterseo/db";
import { isSelfHosted } from "@/lib/self-hosted";
import { resolveEffectivePlan, USAGE_METRICS, type Plan, type UsageMetric } from "@/lib/plans";

export type UsageCheckResult = { allowed: boolean; limit: number; used: number };

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Called before every metered action (Page Analyzer, Site Audit, AI
// Visibility run, etc. - see each route's own call site). A complete no-op
// in SELF_HOSTED mode: no DB round-trip at all, since self-hosted installs
// have no plan/usage concept to enforce. In hosted mode, atomically reads
// this month's counter for (organizationId, metric), compares against the
// org's real effective plan limit, and only increments if still under it -
// the increment and the check happen in the same statement (a single
// upsert with a conditional WHERE), so two concurrent requests can't both
// read "9 of 10 used" and both proceed past the cap.
export async function checkAndIncrementUsage(
  organizationId: string,
  metric: UsageMetric,
  userId: string,
): Promise<UsageCheckResult> {
  if (isSelfHosted()) {
    return { allowed: true, limit: Number.POSITIVE_INFINITY, used: 0 };
  }

  return withUserContext(userId, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org) {
      // Shouldn't happen (caller already resolved this org via
      // requireProjectAccess) - fail closed rather than silently allowing.
      return { allowed: false, limit: 0, used: 0 };
    }

    const plan = resolveEffectivePlan(org);
    const limit = plan.limits[metric];
    const periodStart = currentPeriodStart();

    // Row-locked (FOR UPDATE) so two concurrent requests for the same
    // org+metric+period can't both read the same `used` value before
    // either writes - the second request's SELECT blocks until the first
    // request's transaction commits (or rolls back), then sees the real
    // post-increment count.
    const [existing] = await tx
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.organizationId, organizationId), eq(usageCounters.metric, metric), eq(usageCounters.periodStart, periodStart)))
      .for("update")
      .limit(1);

    const used = existing?.count ?? 0;
    if (used >= limit) {
      return { allowed: false, limit, used };
    }

    if (existing) {
      await tx.update(usageCounters).set({ count: sql`${usageCounters.count} + 1` }).where(eq(usageCounters.id, existing.id));
    } else {
      // No row for this org+metric+period yet - two concurrent
      // first-of-the-month requests could both reach here at once; the
      // table's unique constraint turns the loser into a real
      // constraint-violation error rather than a silent double-row, which
      // withUserContext's transaction then rolls back entirely. Acceptable
      // for v1 (the caller's expensive action simply doesn't run that one
      // time and the user can retry) rather than adding ON CONFLICT
      // upsert complexity for a once-a-month-per-org race window.
      await tx.insert(usageCounters).values({ organizationId, metric, periodStart, count: 1 });
    }

    return { allowed: true, limit, used: used + 1 };
  });
}

// Read-only summary for the Billing settings page - every metric on the
// org's real effective plan, with this month's current count. Never
// increments anything (unlike checkAndIncrementUsage above).
export async function getUsageSummary(
  org: { id: string; planId: string; subscriptionStatus: string; trialEndsAt: Date | null },
  userId: string,
): Promise<{ plan: Plan; usage: Array<{ metric: UsageMetric; used: number; limit: number }> }> {
  const plan = resolveEffectivePlan(org);
  const periodStart = currentPeriodStart();

  const rows = await withUserContext(userId, (tx) =>
    tx.select().from(usageCounters).where(and(eq(usageCounters.organizationId, org.id), eq(usageCounters.periodStart, periodStart))),
  );
  const usedByMetric = new Map(rows.map((r) => [r.metric, r.count]));

  const usage = USAGE_METRICS.map((metric) => ({ metric, used: usedByMetric.get(metric) ?? 0, limit: plan.limits[metric] }));

  return { plan, usage };
}
