# Publishing the Railway one-click-deploy template

`railway.toml` at the repo root tells Railway how to build the `web`
service (Dockerfile-based). That alone lets anyone deploy from this repo
manually, but a **"Deploy on Railway" button** requires creating an actual
Railway Template, which is done from Railway's dashboard, not from a file
in the repo:

1. Push this repo to GitHub (public, since it's open source).
2. In Railway: **New Project → Deploy from GitHub repo**, select this repo.
3. Add a **PostgreSQL** plugin to the project. Railway will expose it as
   `DATABASE_URL` — wire that into the `web` service's variables as a
   reference (`${{Postgres.DATABASE_URL}}`).
4. Set the required variables on the `web` service (see `.env.example`):
   `SELF_HOSTED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, plus whichever AI-provider
   keys you want enabled. Mark secrets as Railway "sealed" variables so
   template users are prompted for their own values instead of inheriting
   yours.
5. Once the project deploys cleanly, use Railway's **Project Settings →
   Create Template** to generate the shareable template + deploy-button
   URL. That URL is what goes in the main README's "Deploy on Railway"
   badge.

This is a one-time manual setup step per template version — there's no way
to generate a working deploy button purely from files in this repo.

## Migrations run automatically

`railway.toml`'s `releaseCommand` runs the real Drizzle migrations
(`packages/db/dist/migrate.mjs`, produced by the Dockerfile's build stage)
once per deploy, before traffic switches to the new release — a fresh
template deploy comes up with a fully migrated schema with no manual step.
Nothing to run by hand.

## RLS and the restricted database role

Locally (`docker compose up`, see `docker/postgres-init.sql`) the app
connects as a restricted `rosterseo_app` role (`NOSUPERUSER NOBYPASSRLS`)
for real runtime traffic, and a separate elevated role only for running
migrations - `packages/db/README.md` explains why this split is what makes
Row-Level-Security policies actually apply instead of silently being
bypassed by a superuser connection.

Railway's managed Postgres plugin gives you a single admin-level
`DATABASE_URL` with no equivalent of that restricted role out of the box.
The default one-click template deploy above uses that same `DATABASE_URL`
for both runtime and migrations (`DATABASE_MIGRATE_URL` falls back to
`DATABASE_URL` when unset) - functionally correct, but RLS policies aren't
the thing actually stopping cross-tenant access in that configuration,
the application code's own scoping is. To get the same real DB-level RLS
guarantee production hosting should have, create a restricted role
yourself (Railway's Postgres plugin has a **Connect → psql** console) using
the same `CREATE ROLE ... NOSUPERUSER NOBYPASSRLS` + grants
`docker/postgres-init.sql` runs locally, then set `DATABASE_URL` to that
restricted role's connection string and `DATABASE_MIGRATE_URL` to the
original admin one.
