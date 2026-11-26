# Architecture

Two decisions shape everything below:

1. **Open-core, not SaaS-only.** Self-hosted (`SELF_HOSTED=true`, the
   default) is single-tenant, no billing, operator's own API keys — this
   stays fully free and functional forever. A multi-tenant hosted SaaS
   mode (`SELF_HOSTED=false`) now also exists on the same codebase: Stripe
   Checkout/Billing Portal/webhooks, in-code plan tiers, and per-org
   monthly usage-limit enforcement (`apps/web/lib/{self-hosted,plans,
   stripe,usage}.ts`). `isSelfHosted()` is the one seam between the two —
   every billing-aware code path checks it, so self-hosted installs never
   see a trace of Stripe. See [ROADMAP.md](./ROADMAP.md) for what's still
   open (a connected-accounts usage cap for Publish/Social, and extending
   the credential-encryption work below past Google tokens). The RLS/org
   model this depends on was built with multi-tenancy as the goal from the
   start, which is why hosted mode could be layered on without a schema
   rewrite.
2. **Self-hostable stack, not vendor-locked.** Vercel and Supabase are
   fine if you're the only operator, but they don't work for "anyone can
   one-click deploy this on Railway." Plain Postgres + Drizzle + Docker is
   the well-established pattern for that goal — followed here.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | page-analyzer needs in-process access to crawler, SERP, AI-visibility, and GSC/GA4 modules simultaneously — not worth splitting into separately-versioned repos |
| App framework | Next.js (App Router) | Single deploy artifact for dashboard UI + API routes; supports Docker standalone output for Railway. TanStack Start was considered (Cloudflare Workers portability via Vinxi) and decided against — that portability doesn't matter since we're Railway/Docker-only, and Next.js has deeper ecosystem maturity + lower implementation risk for an AI-assisted solo build |
| API layer | Next.js Route Handlers, no separate Express/NestJS | No need to run a second HTTP service alongside the dashboard |
| Database | Postgres + Drizzle ORM | Portable — works identically on Railway's managed Postgres, Docker Compose, or any Postgres host. No vendor-specific schema magic |
| Auth | better-auth | Self-hostable (unlike Supabase Auth or Clerk), Drizzle adapter, org/session model we control |
| Tenant isolation | Postgres row-level security, scoped by user via `organization_members` (not directly by org — see below), enforced at the DB layer | Requires the app's `DATABASE_URL` role to be `NOSUPERUSER NOBYPASSRLS` — a superuser silently skips RLS entirely, which we hit directly while testing this |
| Background jobs | pg-boss, run in a separate `apps/worker` process | Postgres-native, no extra infra, matches our self-host-first goal |
| Billing | Stripe, hosted mode only | Checkout + Billing Portal + webhook sync, gated entirely behind `isSelfHosted()` |
| SEO data | DataForSEO API | Single vendor for keywords/SERP/backlinks/on-page/local |
| AI/LLM | Direct provider APIs (OpenAI, Anthropic, Google, Perplexity), plus BrightData + OpenRouter for AI-answer-engine visibility | Broadest real coverage without vendor lock-in to one LLM provider |
| MCP server | `@modelcontextprotocol/sdk`, separate app in the monorepo | Lets a user's own AI tools query their project data directly |
| Deploy targets | Railway (Docker, one-click template), Docker Compose (self-host), any Node host | Railway is primary per the open-source goal; Vercel remains possible since it's still Next.js, just not the default path |

## Monorepo layout

See README.md — same list, kept in one place to avoid drift.

## Runtime process model

Two processes, one Docker image family:
- `apps/web` — Next.js server. Handles all synchronous requests: dashboard
  pages, Route Handler APIs, auth. Never does expensive work inline —
  every crawl / SERP pull / AI-visibility run gets enqueued and returns
  immediately.
- `apps/worker` — plain Node process (no HTTP framework at all). Consumes
  `pg-boss` jobs and calls into the `packages/*` domain packages to do the
  actual work.

Both apps import shared business logic from `packages/*` (db, dataforseo,
ai-visibility, google, crawler, bing, wordpress, indexnow, shopify) rather
than each other, so the MCP server and the web dashboard never end up with
two divergent implementations of "how to fetch keyword rankings."

## Tenant isolation, concretely

Route Handlers check org membership via the auth wrapper in
`apps/web/lib/api-utils.ts`, but that's application-level and can be
forgotten on a new route. Postgres RLS (`packages/db/drizzle/0001_rls_policies.sql`)
is the enforced backstop, with two details that turned out to matter in
practice, not just in theory:

- **Policies are scoped by `user_id`, not `organization_id`.** A request
  that only knows a project id can't know that project's org up front
  without reading it, and can't read it without RLS already allowing it -
  scoping by the requesting user's memberships (via `organization_members`)
  sidesteps that bootstrapping problem. `organization_members`' own policy
  is further restricted to `user_id = current_setting(...)` specifically
  (not a self-join) - a subquery against its own table from within its own
  policy causes infinite recursion in Postgres, which we hit directly.
- **The app's `DATABASE_URL` must be a `NOSUPERUSER NOBYPASSRLS` role.**
  Superusers bypass RLS unconditionally, ignoring `FORCE ROW LEVEL
  SECURITY` - also hit directly, silently, with no error. Migrations
  (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`) need an
  elevated role instead, since DDL requires table-owner or superuser
  privileges. Hence two connection strings: `DATABASE_MIGRATE_URL`
  (elevated, migrations only) and `DATABASE_URL` (restricted, what the app
  actually runs as). See `packages/db/README.md`.

Every tenant-scoped query must go through `withUserContext(userId, cb)`
(`packages/db/src/with-user-context.ts`), which sets the session variable
the policies check, rather than the bare `db` export.

## Auth

better-auth handles signup/login (`apps/web/lib/auth.ts`), with a
`databaseHooks.user.create.after` hook that gives every new signup its own
organization + owner membership row (no "invite teammates" flow yet, so
org == account for now — multi-tenant org management (team invites) is
still open, see "Open decisions" below). `apps/web/middleware.ts` does a cheap cookie-presence check to
keep signed-out visitors out of `(dashboard)` routes; the dashboard layout
itself does the real `auth.api.getSession()` check plus a project-count
check, redirecting to `/onboarding` if the user has none yet.

One non-obvious gotcha this surfaced: Postgres RLS gates `RETURNING`
against the table's SELECT policy, not just the INSERT policy's `WITH
CHECK`. A brand-new organization has no membership row yet, so it isn't
SELECT-visible to itself the instant it's inserted — `.insert(organizations)
.returning()` failed with "new row violates row-level security policy"
even though the INSERT itself was allowed. Fixed by generating the org's
UUID in application code and skipping `.returning()` entirely, so the app
never needs the DB to hand back a row it can't yet see. See migration 0004
and `packages/db/README.md` for the full writeup.

## Migrations

See `packages/db/README.md` for the full migration workflow, safety rules,
and history — the short version: additive-only where possible, never edit
an applied migration file, forward-only (no down migrations), and always
verify RLS changes against the restricted app role, not the migration
role, since superusers bypass RLS silently.

## Caching & Redis

This project deliberately doesn't run Redis. To maintain self-host simplicity and reduce infrastructure overhead, Postgres-based caching (or simple in-memory/file caching where applicable) is preferred over running a separate Redis instance. This ensures the app can run easily on any Node + Postgres setup.

## Credential encryption at rest

OAuth access/refresh tokens, WordPress Application Passwords, and SMTP
passwords were stored plaintext originally — defensible for a
single-operator self-host (the operator is the only person who can ever
read their own database), not defensible once this app hosts *other
people's* credentials in multi-tenant SaaS mode, where a DB leak becomes a
mass account-takeover across every connected customer. `packages/db/src/
crypto.ts` (AES-256-GCM) closes this: opt-in via `CREDENTIAL_ENCRYPTION_KEY`,
backward-compatible (an unset key, or a pre-existing plaintext row, both
pass through unchanged on read), so turning it on needs no backfill
migration and never locks an existing self-hosted install out of its own
data. The helper exists and is tested; wiring it into the actual
read/write call sites for `google_connections`, `wordpress_connections`,
`email_connections`, `blog_connections`, and `social_connections` is
tracked in [ROADMAP.md](./ROADMAP.md) Phase 0 — not done yet.

## Open decisions

- Product name/branding — repo currently uses the placeholder package
  scope `@rosterseo/*`.
- Team invites / multi-member organizations — schema supports it
  (`organization_members` is already a many-to-many join), but there's no
  invite flow yet. Every signup gets a single-member org.
