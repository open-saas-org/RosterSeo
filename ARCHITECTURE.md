# Architecture

This supersedes PRD Section 7 (`seo-saas-prd-v1.md`), which assumed a
closed, Vercel+Supabase-hosted SaaS. Two decisions changed that:

1. **Open-core, not SaaS-only.** Same codebase runs as a single-tenant
   self-hosted deploy (`SELF_HOSTED=true`, no billing, operator's own API
   keys) or a multi-tenant hosted SaaS (`SELF_HOSTED=false`, Stripe billing,
   per-org credit metering, Postgres row-level tenant isolation).
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
| Tenant isolation | Postgres row-level security, scoped by user via `organization_members` (not directly by org — see below), enforced at the DB layer | PRD Section 6 requirement. Requires the app's `DATABASE_URL` role to be `NOSUPERUSER NOBYPASSRLS` — a superuser silently skips RLS entirely, which we hit directly while testing this |
| Background jobs | pg-boss, run in a separate `apps/worker` process | Postgres-native, no extra infra, matches our self-host-first goal |
| Billing | Stripe (hosted mode only) | Off entirely when `SELF_HOSTED=true` |
| SEO data | DataForSEO API | Per PRD — single vendor for keywords/SERP/backlinks/on-page/local |
| AI/LLM | Direct provider APIs (OpenAI, Anthropic, Google, Perplexity) | Per PRD Section 5.7 and 5.1 |
| MCP server | `@modelcontextprotocol/sdk`, separate app in the monorepo | Per PRD Section 5.8 |
| Deploy targets | Railway (Docker, one-click template), Docker Compose (self-host), any Node host | Railway is primary per the open-source goal; Vercel remains possible since it's still Next.js, just not the default path |

## Monorepo layout

See README.md — same list, kept in one place to avoid drift.

## Roadmap

Phased build sequence is unchanged from PRD Section 9 (Month 1: auth +
multi-project + page analyzer; Month 2: crawler + competitor research;
Month 3: GSC/GA4 + local SEO; Month 4: AI-visibility + MCP server + polish;
Phase 2: Shopify Connect). What changed is *how* each phase is built, not
the sequence.

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
org == account for now — PRD Section 5.9's multi-tenant org management is
still open). `apps/web/middleware.ts` does a cheap cookie-presence check to
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

## Open decisions

- Product name/branding (PRD Section 12) — repo currently uses the
  placeholder package scope `@seo-tool/*`.
- Team invites / multi-member organizations (PRD Section 5.9) — schema
  supports it (`organization_members` is already a many-to-many join), but
  there's no invite flow yet. Every signup gets a single-member org.
