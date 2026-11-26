# Roadmap — open-source core + hosted SaaS

Status: written after a full-codebase audit on 2026-11-22; Phases 0-2
below largely shipped the same session, on branch
`feat/saas-and-publish-redesign` (not yet merged to `main` as of this
writing — see the top of git log for the exact commits). This is the
thin, top-level index — each phase below links to the detailed,
authoritative doc for that area rather than duplicating it. Update the
linked doc when a decision changes; update this file only when a phase's
status changes, so the two never drift the way `.env.example`/README
drifted once before (see git history).

## The two products, one codebase

- **Open-source core** (`SELF_HOSTED=true`, the default): free,
  self-hosted, bring-your-own API keys (DataForSEO, LLM providers, Google
  OAuth app). MIT-licensed, Docker/Railway one-click deploy. This stays
  fully free and fully functional forever — hosted mode is an *additional*
  deploy target, not a paywall bolted onto the OSS product.
- **Hosted SaaS** (`SELF_HOSTED=false`): the same codebase, multi-tenant,
  Stripe-billed, operator (you) supplies the DataForSEO/LLM/Google
  credentials so customers never touch an API key. Differentiator for
  customers: zero setup, vs. self-host's zero cost. `isSelfHosted()`
  (`apps/web/lib/self-hosted.ts`) is the one seam — every billing-aware
  code path checks it.

## Phase 0 — Production-readiness & security

- [x] `/api/health` liveness route + Docker `HEALTHCHECK` + non-root
  container user + a real `worker-runner` Docker stage (the worker
  previously ran via dev-mode `tsx watch` inside the full build image —
  fixed, see `Dockerfile`).
- [x] `docker-publish.yml`: GHA layer caching, multi-arch (amd64+arm64),
  and a real second published image for the worker
  (`ghcr.io/<owner>/rosterseo-worker`).
- [x] **Credential encryption at rest** — `packages/db/src/crypto.ts`
  (AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY`, backward-compatible
  plaintext passthrough), wired into every real read/write call site:
  `google_connections`, `wordpress_connections`, `email_connections`
  (SMTP + Gmail OAuth), and `blog_connections`/`social_connections`' jsonb
  `credentials` blobs (via `encryptRecord`/`decryptRecord`). Documented in
  `ARCHITECTURE.md` and `.env.example`.
- [x] Real test coverage started: `packages/db/src/crypto.test.ts`,
  `packages/crawler/src/ssrf-guard.test.ts` — the first test files in the
  monorepo (CI's `pnpm test` had been passing against zero tests). The
  SSRF test immediately caught and fixed a real bug (IPv6 literal URLs
  blocked for the wrong reason, due to a bracket-stripping issue). Still
  open: RLS policy tests, billing/usage-limit tests, Publish/Social
  reschedule-route tests — real test coverage is nowhere near complete,
  this is a start, not a finish line.
- [ ] Full `.env.example` vs. `process.env.*` diff (spot-checked, not
  exhaustively verified).

## Phase 1 — Publish/Social UI rebuild ("Posts workspace") — shipped

Full detail, researched against Postiz/Posterly/Buffer/Metricool:
[PUBLISHING_PLATFORM_PRD.md](./PUBLISHING_PLATFORM_PRD.md).

1. [x] **Posts workspace** — `PostsInspector` side-panel (Sheet), bulk
   select/delete/reschedule, platform/status filters, compose lands on
   Posts (not a dead end). Real `PATCH`/bulk-delete/bulk-reschedule
   routes for both pillars, backed by a new `defineJob().reschedule()`
   that moves an already-enqueued pg-boss job in place.
2. [x] **Calendar drag-and-drop** — `@dnd-kit/core`, per-platform color
   accents, click-to-open-Inspector, time-of-day preserved on drop,
   disabled below the 768px breakpoint (no touch drag yet).
3. [x] **Analytics, Facebook/Instagram + LinkedIn only** (per the PRD's
   own phasing — the other 5 platforms either have no real per-post
   analytics API or need a paid tier, see the PRD's table): new
   `social_post_metrics` table, a daily `apps/worker` polling job,
   `/social/analytics` page with an honest "not available" state per
   metric, a per-post performance view in the Inspector panel. **Not
   live-verified** against real Facebook/Instagram/LinkedIn accounts —
   the LinkedIn metrics specifically use the Social Actions API (not the
   Organic Share Statistics API the PRD assumed, which turned out to be
   scoped to organization-authored posts only, not this app's
   person-authored posting model) with field names taken from docs, not
   tested live. Verify against a real connected account before fully
   trusting this.
4. **Not started**: the remaining 5 platforms' analytics, a client-facing
   approval portal (explicit non-goal), media library (explicit
   non-goal).

## Phase 2 — Hosted SaaS: billing & multi-tenancy — shipped

- [x] **Schema**: `organizations.stripeCustomerId` /
  `stripeSubscriptionId` / `planId` / `subscriptionStatus` / `trialEndsAt`;
  a monthly `usage_counters` table (org_id, metric, period, count).
- [x] **Plans**: in-code config (`apps/web/lib/plans.ts`) — Free (trial-
  expired default) / Starter $29 / Pro $79 / Agency $199, plus a 14-day
  Pro-level trial on every new hosted-mode signup, resolved on read (no
  background job needed to flip an expired trial's effective limits).
- [x] **Stripe**: Checkout + Billing Portal + one webhook route
  (`checkout.session.completed` / `customer.subscription.updated` /
  `customer.subscription.deleted` / `invoice.payment_failed`), using a
  narrowly-scoped additive RLS policy (`with-system-context.ts` +
  migration `0047`) for the one legitimately-unauthenticated write path.
- [x] **`isSelfHosted()`** gates the Billing nav item, the entire billing
  UI, and every usage check — self-hosted installs see none of it.
- [x] **Usage enforcement**: `checkAndIncrementUsage()` (row-locked,
  atomic check-and-increment), wired into Page Analyzer, Rank Tracking,
  Site Audit, AI Visibility, Local SEO, and Publish/Social connection
  creation (`connected_accounts` metric) — all 6 of the original
  `deductCredits()` call sites, now covered.
- [ ] `tracked_keywords` (a standing resource cap, not a monthly action)
  is defined in `plans.ts` but not yet enforced anywhere — needs a plain
  row-count check at keyword-creation time, different shape from
  `checkAndIncrementUsage`.
- [ ] No live Stripe account/webhook exchange has been tested end-to-end
  in this environment — typecheck-clean and carefully reviewed, not
  live-verified.
- Full backlog tracking: add a "13.4 SaaS Billing" section to
  [seo-saas-prd-v1.md](./seo-saas-prd-v1.md) next (that file is this
  project's existing living implementation-status tracker — not yet
  updated with this session's work as of this commit).

## Phase 3 — Open-source polish

- [x] Public roadmap visibility: this file, kept current through Phase 2.
- [ ] Confirm CI badge, CONTRIBUTING.md, SECURITY.md stay accurate — the
  "not implemented yet" billing language was fixed in README/CONTRIBUTING/
  ARCHITECTURE this session; re-scan after any further billing changes.
- [ ] Railway template: add a second Railway service for the worker image
  once it's published (today Railway only deploys the web image).

## What's genuinely still open after this session

- Encryption rollout is wired in, but not live-tested against a real
  OAuth round-trip or a pre-existing plaintext row upgrading cleanly.
- Billing is implemented but never exercised against a real Stripe
  account (test or live mode).
- Analytics field/metric names for all three platforms are doc-sourced,
  not live-verified.
- This branch has not been pushed or opened as a PR yet.
