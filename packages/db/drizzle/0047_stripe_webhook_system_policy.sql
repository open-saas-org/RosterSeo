-- The Stripe webhook handler (apps/web/app/api/webhooks/stripe/route.ts)
-- needs to read/update `organizations` rows (billing columns only, e.g.
-- lookup by stripe_customer_id) before any authenticated user session
-- exists for that request - Stripe calls this endpoint directly, signed,
-- with no cookie. `organizations`' existing tenant_isolation policy
-- (0001) requires app.current_user_id to be a real member, which is
-- unavailable here, and blocks SELECT/UPDATE entirely (fails closed) with
-- no context set at all.
--
-- This is additive, not a replacement: Postgres OR's multiple permissive
-- policies together for the same command, so the existing tenant_isolation
-- policy keeps applying unchanged to every other caller. This new policy
-- only ever matches when app.system_write is set to this exact sentinel -
-- set exclusively by packages/db/src/with-system-context.ts, which has
-- exactly one caller in the whole codebase (the Stripe webhook route).
-- Never widen this to any other table/value without the same level of
-- review - see with-system-context.ts's own comment for the full
-- reasoning and the established precedent (mcp_api_keys/mastodon_apps/
-- provider_spend_log) this follows.
CREATE POLICY system_billing_sync ON organizations
  USING (current_setting('app.system_write', true) = 'stripe_webhook')
  WITH CHECK (current_setting('app.system_write', true) = 'stripe_webhook');
