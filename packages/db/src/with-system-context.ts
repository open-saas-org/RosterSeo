import { sql } from "drizzle-orm";
import { db } from "./index";

// A narrow, explicitly-reviewed escape hatch from withUserContext's
// user_id-scoped RLS model, for the ONE real case where a legitimate
// server-side write has no authenticated user at all: the Stripe webhook
// handler (apps/web/app/api/webhooks/stripe/route.ts), which needs to
// read/update an `organizations` row (billing columns only) identified by
// Stripe customer/subscription id, verified by Stripe's signature, before
// any user session exists in that request.
//
// This is the same class of problem this codebase already has a blessed
// pattern for (see mcp_api_keys / mastodon_apps / provider_spend_log's own
// RLS-exclusion comments: "the server has to resolve ownership before any
// request context exists") - but unlike those tables, `organizations`
// genuinely needs its normal per-user tenant_isolation policy to keep
// applying to every other caller, so instead of excluding the whole table
// from RLS, migration 0046 adds one additional, narrowly-scoped permissive
// policy that only matches when this session variable is set to the exact
// sentinel below. Policies OR together in Postgres, so the existing
// tenant_isolation policy is completely untouched by this.
//
// NEVER call this from anywhere a real userId is available - use
// withUserContext for every normal request. This exists for exactly one
// caller.
export async function withSystemContext<T>(
  callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.system_write', 'stripe_webhook', true)`);
    return callback(tx);
  });
}
