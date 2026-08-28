# @seo-tool/db

Drizzle schema, migrations, and the RLS-based tenant isolation described in
ARCHITECTURE.md.

## Two database roles, not one

This matters and is easy to get wrong: **the app's runtime `DATABASE_URL`
must be a non-superuser role with `NOBYPASSRLS`**, or every RLS policy in
`drizzle/0001_rls_policies.sql` is silently ignored - Postgres superusers
and `BYPASSRLS` roles skip row security unconditionally, regardless of
`FORCE ROW LEVEL SECURITY`. We hit this directly while building it: testing
against the default superuser role returned every tenant's rows with no
context set, no errors, no warning.

So there are two connection strings:

- `DATABASE_MIGRATE_URL` - elevated (table owner or superuser). Only used
  by `pnpm db:migrate` and `drizzle-kit` commands, which need to run DDL
  (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`).
- `DATABASE_URL` - restricted (`NOSUPERUSER NOBYPASSRLS`). Used by
  `apps/web` and `apps/worker` at runtime. This is the one RLS actually
  applies to.

If `DATABASE_MIGRATE_URL` isn't set, migrations fall back to `DATABASE_URL`
- fine for a quick local spike, wrong for anything you're actually testing
tenant isolation against.

### Local setup (non-Docker)

```sql
CREATE ROLE seo_tool_app WITH LOGIN PASSWORD '<pick one>' NOSUPERUSER NOBYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO seo_tool_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO seo_tool_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO seo_tool_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO seo_tool_app;
-- apps/worker's pg-boss needs to create its own `pgboss` schema on first
-- start. This doesn't touch RLS - CREATE lets it make new objects, not
-- read rows through existing policies.
GRANT CREATE ON DATABASE seo_tool TO seo_tool_app;
```

Run migrations as your regular (superuser) role via `DATABASE_MIGRATE_URL`,
then point `DATABASE_URL` at `seo_tool_app` for `pnpm dev`.

### Docker / Railway

`docker/postgres-init.sql` does the same thing automatically on first
container start (mounted into `/docker-entrypoint-initdb.d/` by
`docker-compose.yml`).

## Tenant context

Every tenant-scoped query must run through `withUserContext(userId, cb)`
(`src/with-user-context.ts`), never against the bare `db` export - see the
comment at the top of `drizzle/0001_rls_policies.sql` for why it's scoped
by user rather than by org.

## Migration history

| # | File | What it does |
|---|---|---|
| 0000 | `0000_*.sql` | Initial schema: better-auth tables (`user`, `session`, `account`, `verification`) + core app tables (`organizations`, `organization_members`, `projects`, `project_competitors`, `tracked_keywords`, `credit_ledger`) |
| 0001 | `0001_rls_policies.sql` | RLS on the core tables, scoped by user via `organization_members` (see the long comment at the top for why - the short version: scoping by org directly creates a bootstrapping problem for a brand-new org) |
| 0002 | `0002_*.sql` | Feature-module tables: `page_analyzer_reports`, `keyword_rankings`, `site_audits`, `site_audit_issues`, `ai_visibility_prompts`, `ai_visibility_results`, `local_rank_checks`, `google_connections` |
| 0003 | `0003_rls_policies_v2.sql` | RLS on the 0002 tables, same pattern, including the nested-relation cases (e.g. `site_audit_issues` has no `project_id` of its own - it goes through `site_audits`) |
| 0004 | `0004_org_signup_bootstrap_rls.sql` | Additive INSERT-only policies enabling the signup flow to create a brand-new org (and its first membership row) - see "Adding a migration" below for the bug this fixes and how it was found |
| 0005 | `0005_charming_power_pack.sql` | `saved_keywords` table (project-scoped watchlist, no location/rankings relation) + its RLS policy - same `tenant_isolation` shape as `tracked_keywords`' from 0001, added in the same migration since there's no bootstrapping chicken-egg problem for a table with an already-established project/org |
| 0006 | `0006_google_connections_org_scoped.sql` | Corrects `google_connections` from project-scoped to organization-scoped (a Google OAuth grant belongs to the account, not one project - drops `project_id`/`property_id`, adds `organization_id` + `UNIQUE (organization_id, service)`, drops and recreates its RLS policy since it references the dropped column) and adds `projects.gsc_property_id`/`ga4_property_id` for per-project property selection. `TRUNCATE`s `google_connections` first since there's no real data to preserve at this stage - an exception to "prefer additive," called out explicitly rather than silently; would need a proper backfill if real customer connections existed |
| 0007 | `0007_plain_human_robot.sql` | `site_audit_pages` table (per-page crawl stats for a completed audit) |
| 0008 | `0008_site_audit_pages_rls.sql` | RLS for `site_audit_pages`, scoped indirectly through `site_audits.project_id` |
| 0009 | `0009_ai_visibility_expansion.sql` | `projects.ai_visibility_context`, `ai_visibility_prompts.parent_prompt_id` (self-referencing, for Query Fan-Out's prompt hierarchy) |
| 0010 | `0010_google_connections_reconnect_flag.sql` | `google_connections.needs_reconnect` - real refresh-failure state, distinct from a merely-expired access token |
| 0011 | `0011_local_seo_grid_and_gbp.sql` | Google Business Profile OAuth columns on `projects` + the original grid-ranking tables (later replaced, see 0013) |
| 0012 | `0012_drop_credit_ledger.sql` | Drops `credit_ledger` - the credit-metering system was removed; provider credentials are global env vars instead (see the note on `projects.ai_visibility_targets`) |
| 0013 | `0013_local_seo_v2.sql` | Local SEO v2: drops the GBP OAuth columns and the old one-off rank checker, adds `local_business_profiles` (DataForSEO-backed profile + Monitor config) and `local_seo_recommendations` (Optimize checklist) |
| 0014 | `0014_local_business_profiles_gbp_link.sql` | Optional GBP account/location linkage columns on `local_business_profiles`, for the future GBP-based feature the Business Profile integration card stays connectable for |
| 0015 | `0015_bing_indexnow_wordpress.sql` | `projects.bing_site_url`/`indexnow_key` + the `wordpress_connections` table - three integrations that don't need OAuth (global API key, keyless protocol, and Application Password respectively) |
| 0016 | `0016_merchant_account_id.sql` | `projects.merchant_account_id`, for the Merchant API (Content API for Shopping's replacement) |
| 0017 | `0017_vengeful_silver_sable.sql` | Rank Tracking rebuild: `rank_check_runs` (one row per bulk Fetch Rankings execution), `rank_tracking_settings`, plus new columns on `tracked_keywords`/`keyword_rankings` for cached metrics and per-run grouping |
| 0018 | `0018_far_blazing_skull.sql` | Drops `saved_keywords` - superseded by `keyword_metrics_cache`/`keyword_research_searches` (0019) |
| 0019 | `0019_conscious_snowbird.sql` | Keyword Research rebuild: `keyword_metrics_cache` (7-day-fresh cache keyed by project+keyword+location) and `keyword_research_searches` (search history) |
| 0020 | `0020_many_sprite.sql` | `ai_visibility_opportunity_reports` (persisted content/outreach opportunity digests) |
| 0021 | `0021_dry_ozymandias.sql` | `ai_visibility_prompts.tags`/`enabled` - free-form organizing tags and the pause-without-deleting toggle |
| 0022 | `0022_old_squadron_sinister.sql` | `ai_visibility_opportunity_reports.model` - which model actually generated a given report |
| 0023 | `0023_complete_forge.sql` | `project_competitors.name` - a real display name for a competitor added via AI Visibility's Competitors settings (SEO Competitor Research rows leave this null) |
| 0024 | `0024_blue_wolverine.sql` | `projects.archived_at` - soft-delete/restore for the "delete but keep the data" project-settings flow |
| 0025 | `0025_gifted_thing.sql` | `mcp_api_keys` table - hashed personal-access-token auth for the standalone MCP server, deliberately excluded from RLS (see the migration's own comment: the server has to resolve a key's owner before any request context exists) |
| 0026 | `0026_workable_stryfe.sql` | `keyword_rankings.is_mock` - marks a position snapshot as demo/fallback data so a DataForSEO outage can never be mistaken for a real ranking anywhere this row is read |
| 0027 | `0027_kind_living_lightning.sql` | Drops `ai_visibility_prompts.parent_prompt_id` - a self-referencing FK for a prompt-hierarchy shape Query Fan-Out never actually populated (it's a read-only analysis dashboard over existing prompts, not a prompt generator); dead column, dead client-side filter, removed together |
| 0028 | `0028_slow_eddie_brock.sql` | `backlinks_cache` table - same 7-day-fresh cache-per-lookup shape as `keyword_metrics_cache` (0019), so a repeat Backlinks domain lookup skips DataForSEO instead of re-paying the API cost every time |
| 0029 | `0029_messy_havok.sql` | `provider_spend_log` table - real (or clearly-flagged-estimated) per-call cost tracking for DataForSEO/BrightData/the AI Visibility LLM providers, instance-wide (see the table's own comment for why no `project_id`) |
| 0030 | `0030_premium_bullseye.sql` | Backlink Outreach: `email_connections` (project-scoped SMTP/Gmail-OAuth sender identities) + `outreach_targets` (one row per outreach target, draft, and send status) + `backlinks_cache.top_backlinks` (real individual backlink rows alongside the existing aggregate columns) |
| 0031 | `0031_late_gauntlet.sql` | Clay (in-app AI agent): `clay_conversations` + `clay_messages` (per-project, per-user chat history and tool-call state) + `clay_project_notes` (LLM-maintained per-project memory summary, plain Postgres, no vector search) + `projects.clay_provider`/`clay_model` (which of the 3 tool-calling-capable providers this project's assistant uses) |
| 0032 | `0032_slimy_odin.sql` | Publish (multi-platform blog publishing): `blog_connections` (project-scoped, one row per connected blog platform account, `credentials` as a jsonb blob since there are 9+ platforms with different auth shapes) + `blog_posts` (canonical Markdown post) + `blog_post_targets` (one row per platform a post targets, AI-respun/editable variant + independent send status per platform) |
| 0033 | `0033_last_grey_gargoyle.sql` | Social (multi-platform social publishing): `social_connections` + `social_posts` (short-form text, not Markdown) + `social_post_targets` - same shape as 0032's blog tables, applied to social platforms - plus `mastodon_apps` (instance-wide, deliberately NOT RLS-protected, same exception as `mcp_api_keys` - caches the per-instance OAuth app Mastodon's API requires operators to register dynamically) |
| 0034 | `0034_wealthy_vivisector.sql` | `site_audit_links` - the crawl's real link graph (source URL -> target URL, internal or external), captured at zero extra HTTP cost since every internal target already gets crawled anyway. Backs three new Site Audit checks: internal/external broken links and orphaned-page detection (an anti-join - a page nothing else links to) |
| 0035 | `0035_steady_namor.sql` | `site_audits.crawl_completed`/`link_graph_complete` (persisted completion flags for the on-demand deep check, since it can run long after the crawl job exits) + `deep_check_status`/`deep_check_started_at`/`deep_check_completed_at` - broken links/orphaned pages/keyword cannibalization moved out of the main crawl into their own separate, on-demand pass with its own lifecycle |
| 0036 | `0036_thin_golden_guardian.sql` | AI Visibility parity work: `ai_visibility_results.raw_output` (the full raw provider payload behind each parsed row, so future mention/sentiment/citation-parsing improvements can be re-applied to history) + `projects.ai_visibility_aliases`/`ai_visibility_additional_domains` and `project_competitors.aliases`/`additional_domains` (alternate names and extra owned domains, fed into mention-detection and citation classification so sub-brands/regional domains don't get missed or miscategorized) |
| 0037 | `0037_thin_sabretooth.sql` | Site Audit technical-table columns on `site_audit_pages`: `canonical_url`/`meta_robots` (already extracted by the crawler, previously discarded before this) + `crawl_depth` (real BFS link-distance, new tracking in crawler.ts) + `action`/`notes` (manual per-page triage the user sets while working through issues) |
| 0038 | `0038_quiet_galactus.sql` | `site_audit_pages.h2_texts` - first 2 real H2 headings per page, captured unconditionally (cheap - a couple more Cheerio selector calls on HTML already parsed) for the Pages table's Content columns |

## Adding a migration

```bash
# schema.ts change -> auto-generated migration
pnpm --filter @seo-tool/db generate

# hand-written SQL (RLS policies, data backfills, etc.) -> empty file to fill in
cd packages/db && npx drizzle-kit generate --custom --name=<description>
```

Then apply it locally with `pnpm db:migrate` (uses `DATABASE_MIGRATE_URL`)
and **verify against the restricted role, not the superuser** - see below,
this is not optional.

### Rules, in order of how expensive they are to violate

1. **Never edit a migration file that's already been applied anywhere**
   (including just your own local DB, if you've shared work from it).
   `drizzle-orm`'s migrator decides what's "already applied" by comparing
   **timestamps** (each journal entry's `when` against the max `created_at`
   already in `drizzle.__drizzle_migrations`), not by content hash - editing
   an applied file desyncs anyone who already ran it from anyone who runs
   it fresh, with no error to tell you it happened. `src/migrate.ts` runs a
   real hash-based integrity check after every `migrate()` call specifically
   to catch this class of drift (a migration whose journal `when` ends up
   earlier than an already-applied one's `created_at` gets silently
   skipped by the timestamp comparison, which has happened for real in this
   repo's own history) - if it ever throws "was NOT applied to the
   database," that's this rule already having been violated somewhere,
   not a false alarm. Add a new migration instead of editing, even to fix a
   mistake in the previous one. (0004 fixing an RLS gap that 0001 could in
   principle have shipped with is exactly this pattern - we didn't go back
   and edit 0001.)
2. **Prefer additive changes.** New tables, new nullable columns, new
   permissive RLS policies (which OR with existing ones - see 0004's own
   comment) can all ship without touching what's already running. Dropping
   a column or tightening a constraint can't be undone by a later migration
   if something depended on the old shape.
3. **For an actually destructive change** (drop column, drop table, add a
   `NOT NULL` to an existing column), split it across two deploys: first
   ship the app code change that stops reading/writing the old shape,
   *then* ship the migration that removes it. Never both in the same
   deploy - if the new code has a bug, you want the option to roll the code
   back without the old column already being gone.
4. **No down migrations.** This project is forward-only: if a migration
   turns out to be wrong, fix it with a new migration, don't try to write
   a reverse one. Down-migrations that see real production use are rare
   enough (and dangerous enough re: data loss) that "roll forward" is the
   more honest default. The actual safety net is backups - see below.

### Verify against the restricted role, every time

This is the mistake that produced 0004. Testing a new RLS policy (or
anything touching tenant data) **as the Postgres superuser proves
nothing** - superusers bypass RLS unconditionally, so a broken policy and a
working one look identical from that connection. Always test as
`seo_tool_app` (or your local equivalent):

```bash
PGPASSWORD=<pw> psql -h localhost -U seo_tool_app -d seo_tool
```

and actually exercise the policy - insert/select/update the specific rows
your migration is supposed to affect, including edge cases like "user has
no rows yet" (the exact case 0004 covers).

### Production deploy: run migrations as a release step, not on every boot

Migrations should run **once per deploy, before traffic reaches the new
version** - not automatically inside `apps/web`'s or `apps/worker`'s
startup code. If migrations ran on every container boot, scaling to
multiple instances (or a crash-loop) could run the same migration
concurrently from several processes at once. On Railway, wire this as a
release/pre-deploy command (or run it manually via
`docker compose run --rm web pnpm --filter @seo-tool/db migrate` for
self-hosters) using the elevated `DATABASE_MIGRATE_URL` role, separate
from the app's own runtime connection.

### Back up before migrating production

Self-hosters: `pg_dump` your database before applying a new release's
migrations, especially anything in the "destructive change" category
above. Forward-only migrations mean the only way back from a bad one is a
new migration or a restore - there's no automatic undo.
