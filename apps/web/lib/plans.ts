// Hosted-SaaS plan config (SELF_HOSTED=false only - see self-hosted.ts).
// Deliberately in-code, not a database table: these are product decisions
// shipped with a release, not something an operator or customer edits at
// runtime. Cashfree Plan IDs stay in env vars so switching from sandbox to
// production (or repricing) never needs a deploy of this file.
//
// Limits use a very high finite number (not Infinity) for "unlimited" so
// every limit stays a plain comparable number wherever it's read (e.g.
// `used < limit`) without a special-case branch for the unlimited tiers.

// Monthly-metered actions, checked/incremented via usage.ts's
// usage_counters table. `tracked_keywords` is deliberately NOT here - it's
// a standing resource cap (how many rows exist right now), not a
// once-a-month action, so it doesn't fit the same "increment a monthly
// counter" model as the rest. It lives in `Plan.limits.maxTrackedKeywords`
// instead; enforcing it needs a plain row-count check at keyword-creation
// time, not checkAndIncrementUsage - not yet wired in, tracked as a
// follow-up (see this file's own PR/commit notes).
export const USAGE_METRICS = ["page_analyzer_reports", "site_audits", "ai_visibility_prompts", "rank_checks", "local_seo_scans", "connected_accounts"] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

// Single source of truth for human-readable metric names - a Record typed
// over every UsageMetric (not a plain object with a `?? metric` fallback
// at the call site) so adding a metric to USAGE_METRICS without adding its
// label here is a compile error, not a raw snake_case string silently
// leaking into the Billing page's UI (which is exactly what happened to
// rank_checks/local_seo_scans before this existed - they were added here
// without the then-separate label map in usage-meter.tsx being updated).
export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
  page_analyzer_reports: "Page Analyzer reports",
  site_audits: "Site audits",
  ai_visibility_prompts: "AI Visibility prompts",
  rank_checks: "Rank checks",
  local_seo_scans: "Local SEO scans",
  connected_accounts: "Connected Publish/Social accounts",
};

export type Plan = {
  id: "free" | "trial" | "starter" | "pro" | "agency";
  name: string;
  priceUsd: number | null; // null = not purchasable directly (free/trial)
  cashfreePlanEnvVar: "CASHFREE_PLAN_STARTER" | "CASHFREE_PLAN_PRO" | "CASHFREE_PLAN_AGENCY" | null;
  limits: {
    projects: number;
    maxTrackedKeywords: number;
  } & Record<UsageMetric, number>;
};

const UNLIMITED = 999_999;

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: null,
    cashfreePlanEnvVar: null,
    limits: {
      projects: 1,
      maxTrackedKeywords: 25,
      page_analyzer_reports: 3,
      site_audits: 0,
      ai_visibility_prompts: 0,
      rank_checks: 0,
      local_seo_scans: 0,
      connected_accounts: 0,
    },
  },
  {
    // 14-day trial of Pro-level limits for every new hosted-mode signup -
    // see resolvePlan() below for how/when this falls back to "free".
    id: "trial",
    name: "Trial",
    priceUsd: null,
    cashfreePlanEnvVar: null,
    limits: {
      projects: 10,
      maxTrackedKeywords: 1000,
      page_analyzer_reports: 60,
      site_audits: 4,
      ai_visibility_prompts: 40,
      rank_checks: 60,
      local_seo_scans: 20,
      connected_accounts: 10,
    },
  },
  {
    id: "starter",
    name: "Starter",
    priceUsd: 10,
    cashfreePlanEnvVar: "CASHFREE_PLAN_STARTER",
    limits: {
      projects: 3,
      maxTrackedKeywords: 150,
      page_analyzer_reports: 15,
      site_audits: 1,
      ai_visibility_prompts: 10,
      rank_checks: 15,
      local_seo_scans: 5,
      connected_accounts: 2,
    },
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 20,
    cashfreePlanEnvVar: "CASHFREE_PLAN_PRO",
    limits: {
      projects: 10,
      maxTrackedKeywords: 1000,
      page_analyzer_reports: 60,
      site_audits: 4,
      ai_visibility_prompts: 40,
      rank_checks: 60,
      local_seo_scans: 20,
      connected_accounts: 10,
    },
  },
  {
    id: "agency",
    name: "Agency",
    priceUsd: 40,
    cashfreePlanEnvVar: "CASHFREE_PLAN_AGENCY",
    limits: {
      projects: UNLIMITED,
      maxTrackedKeywords: UNLIMITED,
      page_analyzer_reports: 200,
      site_audits: 15,
      ai_visibility_prompts: 150,
      rank_checks: 200,
      local_seo_scans: 100,
      connected_accounts: UNLIMITED,
    },
  },
];

export function getPlan(planId: string): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0]!; // unknown id -> "free", never throws
}

export function getPlanByCashfreePlanId(cashfreePlanId: string): Plan | null {
  return (
    PLANS.find((p) => p.cashfreePlanEnvVar && process.env[p.cashfreePlanEnvVar] === cashfreePlanId) ?? null
  );
}

// Resolves the real, currently-effective plan for an org - the one piece
// of logic that knows a "trialing" org whose trialEndsAt has passed no
// longer gets trial-tier limits, computed on read rather than via a
// background job that would have to flip planId/subscriptionStatus on a
// schedule. Does NOT mutate the org row; callers that need the DB to
// reflect an expired trial should write planId/subscriptionStatus back
// themselves (not required for usage.ts's read-only limit checks).
export function resolveEffectivePlan(org: {
  planId: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}): Plan {
  if (org.subscriptionStatus === "trialing" && org.trialEndsAt && org.trialEndsAt.getTime() < Date.now()) {
    return getPlan("free");
  }
  return getPlan(org.planId);
}

export function isPaidPlanActive(org: { planId: string; subscriptionStatus: string }): boolean {
  const plan = getPlan(org.planId);
  return plan.priceUsd !== null && org.subscriptionStatus === "active";
}
