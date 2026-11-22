// Hosted-SaaS plan config (SELF_HOSTED=false only - see self-hosted.ts).
// Deliberately in-code, not a database table: these are product decisions
// shipped with a release, not something an operator or customer edits at
// runtime. Stripe Price IDs stay in env vars so switching from Stripe test
// mode to live mode (or repricing) never needs a deploy of this file.
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

export type Plan = {
  id: "free" | "trial" | "starter" | "pro" | "agency";
  name: string;
  priceUsd: number | null; // null = not purchasable directly (free/trial)
  stripePriceEnvVar: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_AGENCY" | null;
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
    stripePriceEnvVar: null,
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
    stripePriceEnvVar: null,
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
    priceUsd: 29,
    stripePriceEnvVar: "STRIPE_PRICE_STARTER",
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
    priceUsd: 79,
    stripePriceEnvVar: "STRIPE_PRICE_PRO",
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
    priceUsd: 199,
    stripePriceEnvVar: "STRIPE_PRICE_AGENCY",
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

export function getPlanByStripePrice(stripePriceId: string): Plan | null {
  return (
    PLANS.find((p) => p.stripePriceEnvVar && process.env[p.stripePriceEnvVar] === stripePriceId) ?? null
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
