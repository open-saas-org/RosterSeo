# Roadmap — open-source core + hosted SaaS

Status: **active build plan**, written after a full-codebase audit on
2026-11-22. This is the thin, top-level index — each phase below links to
the detailed, authoritative doc for that area rather than duplicating it.
Update the linked doc when a decision changes; update this file only when
a phase's status changes, so the two never drift the way `.env.example`/
README drifted once before (see git history).

## The two products, one codebase

- **Open-source core** (`SELF_HOSTED=true`, the only mode that exists
  today): free, self-hosted, bring-your-own API keys (DataForSEO, LLM
  providers, Google OAuth app). MIT-licensed, Docker/Railway one-click
  deploy. This stays fully free and fully functional forever — hosted mode
  is an *additional* deploy target, not a paywall bolted onto the OSS
  product.
- **Hosted SaaS** (`SELF_HOSTED=false`, not implemented yet — this
  roadmap's main new work): the same codebase, multi-tenant, Stripe-billed,
  operator (you) supplies the DataForSEO/LLM/Google credentials so
  customers never touch an API key. Differentiator for customers: zero
  setup, vs. self-host's zero cost.

## Phase 0 — Production-readiness & security (do first, blocks hosted mode)

Full detail: see the "Critical"/"Important" items below; no separate doc,
small enough to track here.

- [x] `/api/health` liveness route + Docker `HEALTHCHECK` + non-root
  container user + a real `worker-runner` Docker stage (the worker
  previously ran via dev-mode `tsx watch` inside the full build image —
  fixed, see `Dockerfile`).
- [x] `docker-publish.yml`: GHA layer caching, multi-arch (amd64+arm64),
  and a real second published image for the worker
  (`ghcr.io/<owner>/rosterseo-worker`).
- [ ] **Credential encryption at rest** — Google OAuth tokens, WordPress
  Application Passwords, SMTP passwords are stored plaintext today. Fine
  for single-operator self-host; not acceptable once this app holds
  *other people's* Google/social credentials in hosted mode. Needed before
  hosted mode takes real signups: `packages/db/src/crypto.ts`
  (AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY` env var), applied at
  minimum to `google_connections`, `wordpress_connections`, and any SMTP
  credential column, with a backward-compatible read path (decrypt if it
  looks encrypted, pass through plaintext otherwise) so existing
  self-hosted installs don't break on upgrade.
- [ ] Real test coverage. `pnpm test` has been passing with **zero test
  files** in the entire monorepo (`passWithNoTests: true` everywhere) —
  CI's test gate has never actually caught anything. Priority order: RLS
  policy tests (the thing most likely to silently fail and leak data
  across tenants), the new billing/usage-limit logic, the SSRF guard
  (already has real logic worth locking in), the new Publish/Social
  reschedule routes.
- [ ] Full `.env.example` vs. `process.env.*` diff (spot-checked, not
  exhaustively verified this pass).

## Phase 1 — Publish/Social UI rebuild ("Posts workspace")

Full detail, researched against Postiz/Posterly/Buffer/Metricool:
[PUBLISHING_PLATFORM_PRD.md](./PUBLISHING_PLATFORM_PRD.md). Status in that
doc is the source of truth; summary:

1. **Posts workspace** — Inspector side-panel (reuse `Sheet`), bulk
   select/delete/reschedule (reuse `rank-tracking-table.tsx`'s pattern),
   platform/status filters, compose lands on Posts (not a dead end). New
   `PATCH` reschedule routes for both pillars.
2. **Calendar drag-and-drop** — `@dnd-kit` (new dependency), per-platform
   color, click-to-open-Inspector.
3. **Analytics** — real per-platform engagement data (Facebook/Instagram +
   LinkedIn first, per each platform's actual API support — not every
   platform can back this honestly, see the PRD's table), background
   polling job, new `social_post_metrics` table.

## Phase 2 — Hosted SaaS: billing & multi-tenancy

Design is decided (not open questions) — implementing against this plan:

- **Schema** (new migration): `organizations.stripeCustomerId` /
  `stripeSubscriptionId` / `planId` / `subscriptionStatus` / `trialEndsAt`;
  a monthly `usage_counters` table (org_id, metric, period, count) —
  simpler than the old per-event credit ledger, sufficient for hard
  per-tier caps.
- **Plans**: in-code config (`apps/web/lib/plans.ts`), not a DB table —
  tiers are a product decision shipped with code, not user-editable data.
  Starter ($29/mo) / Pro ($79/mo) / Agency ($199/mo) + a 14-day trial,
  limits per Page-Analyzer-reports/mo, tracked keywords, site audits/mo,
  AI-visibility prompts, connected Publish/Social accounts.
- **Stripe**: Checkout (subscription creation) + Billing Portal (self-serve
  management) + one webhook route handling
  `checkout.session.completed` / `customer.subscription.updated` /
  `customer.subscription.deleted` / `invoice.payment_failed`.
- **`isSelfHosted()`**: one helper (`apps/web/lib/self-hosted.ts`,
  `SELF_HOSTED !== "false"`, defaults true) gating the entire billing UI,
  usage enforcement, and the onboarding plan-selection step — self-hosted
  installs never see any of this.
- **Usage enforcement**: one `checkAndIncrementUsage()` helper, called at
  each of the ~6 call sites where the old (deleted) `deductCredits()` used
  to live — Page Analyzer, Rank Tracking, Site Audit, AI Visibility, Local
  SEO, Publish/Social connection creation. No-ops entirely when
  self-hosted.
- Full backlog tracking: add a "13.4 SaaS Billing" section to
  [seo-saas-prd-v1.md](./seo-saas-prd-v1.md) as it ships (that file is this
  project's existing living implementation-status tracker — keep using it,
  don't fork a second one).

## Phase 3 — Open-source polish

- Public roadmap visibility: this file, kept current.
- Confirm CI badge, CONTRIBUTING.md, SECURITY.md stay accurate once hosted
  mode exists (self-host contributors shouldn't need to care about Stripe
  code paths at all — keep `isSelfHosted()` as the one clean seam).
- Railway template: add a second Railway service for the worker image once
  it's published (today Railway only deploys the web image; the worker
  needs its own service pointed at `rosterseo-worker:latest` — tracked
  here, not yet done).

## Why this order

Publish/Social UI ships before billing because it's pure UI + small
backend additions on top of already-working features — fast, visible,
addresses the explicit "I don't like this UI" complaint immediately. SaaS
billing ships after Phase 0's credential-encryption work specifically
because taking real customer signups while still storing their connected
accounts' tokens in plaintext would be irresponsible to ship, regardless
of how good the billing UX is.
