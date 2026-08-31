# Publishing the Railway one-click-deploy template

The template deploys the **published Docker image**
(`ghcr.io/open-saas-org/rosterseo:latest`), not a from-source Railway build.
Deliberate choice, not a shortcut: pulling a prebuilt image is seconds
instead of the ~5 minutes a full monorepo Docker build takes, it needs no
GitHub authorization from the deployer, and it's exactly what got tested
end-to-end while building this (see below). `railway.toml` at the repo root
still exists and works for anyone who links this repo directly and lets
Railway build from source instead - it's just not what the template button
uses.

## One-time setup, from scratch

1. **New Project → Empty Project** (not "Deploy from GitHub repo" - that
   path builds from source, which this template deliberately avoids).
2. **Add a service → Database → PostgreSQL.**
3. **Add a service → Docker Image**, image:
   `ghcr.io/open-saas-org/rosterseo:latest`, name it `RosterSEO`.
4. On the `RosterSEO` service, **Settings → Networking → Generate Domain**,
   then set that domain's **target port to `3000`** explicitly - Railway
   does not infer this for an image-based service, and leaving it unset is
   the single most common cause of a "Application failed to respond" 502
   here (confirmed live while setting this template up).
5. Set variables on the `RosterSEO` service:
   - `SELF_HOSTED=true`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` - a reference, not a literal
     value, so it always points at *that deployer's own* database
   - `BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`
   - `NEXT_PUBLIC_BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`
   - `APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`
   - `BETTER_AUTH_SECRET` - any value for now; when creating the template
     (step 7) mark this one **"Generate new value"** so every deployer gets
     their own random secret instead of copying yours
   - `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, and whichever AI-provider
     key(s) you want enabled (`OPENROUTER_API_KEY` is the simplest single
     key covering multiple providers) - leave these **blank** here; mark
     them as required template inputs in step 7 instead of filling in your
     own real keys, or every deployer's instance would start with (and
     could potentially expose) your credentials
6. Confirm it actually works before templating it: visit the generated
   domain, confirm it redirects to `/signup` (a fresh database has no user
   yet - see the self-hosting docs' first-run behavior), create an account,
   confirm the dashboard loads.
7. **Project Settings → Create Template.** For each variable from step 5
   that holds a real credential, set its role to **prompt the deployer for
   their own value** (Railway calls this a template/input variable) rather
   than a fixed value - do not let Railway bake your real API keys in as
   template defaults. Add a name, description, and icon, then publish. If
   you want it listed in Railway's public template marketplace (not just
   reachable by direct link), enable that from the same screen.
8. Copy the resulting **"Deploy on Railway" button markdown** Railway shows
   on the published template's page - that's what goes in the main
   README's badge (currently a placeholder link) and the marketing site.

## Keeping the template's image current

`:latest` updates on every push to `main` (see
`.github/workflows/docker-publish.yml`), so every *new* deploy of the
template always pulls the current version automatically - nothing to do
there. An *already-running* deployment (including this template's own
source project, if you keep it around after publishing) does not
auto-update; redeploy it manually from **Deployments → Redeploy** to pull
the latest image. See the self-hosting docs' "Updating a running
deployment" section for the same instructions self-hosters see.

## RLS and the restricted database role

Locally (`docker compose up`, see `docker/postgres-init.sql`) the app
connects as a restricted `rosterseo_app` role (`NOSUPERUSER NOBYPASSRLS`)
for real runtime traffic, and a separate elevated role only for running
migrations - `packages/db/README.md` explains why this split is what makes
Row-Level-Security policies actually apply instead of silently being
bypassed by a superuser connection.

Railway's managed Postgres plugin gives you a single admin-level
`DATABASE_URL` with no equivalent of that restricted role out of the box.
The template above uses that same `DATABASE_URL` for both runtime and
migrations (`DATABASE_MIGRATE_URL` falls back to `DATABASE_URL` when
unset) - functionally correct, but RLS policies aren't the thing actually
stopping cross-tenant access in that configuration, the application code's
own scoping is. To get the same real DB-level RLS guarantee production
hosting should have, create a restricted role yourself (Railway's Postgres
plugin has a **Connect → psql** console) using the same
`CREATE ROLE ... NOSUPERUSER NOBYPASSRLS` + grants `docker/postgres-init.sql`
runs locally, then set `DATABASE_URL` to that restricted role's connection
string and `DATABASE_MIGRATE_URL` to the original admin one.
