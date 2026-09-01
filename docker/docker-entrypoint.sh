#!/bin/sh
# Default startup for a plain `docker run`/generic host - Fly.io, Render, a
# bare VPS, docker-compose, anything with no separate "release phase"
# primitive to hook a migration into. Runs the real Drizzle migrations
# (packages/db/dist/migrate.mjs, see packages/db/package.json's "build"
# script and packages/db/src/migrate.ts) once on every container boot,
# THEN starts the actual web server (`exec`, not a plain call, so it
# replaces this shell as PID 1 and correctly receives SIGTERM for graceful
# shutdown) - never the other way around, so the app is never reachable
# against an unmigrated/partially-migrated schema.
#
# `set -e` - if migrations fail, this script exits non-zero and the
# container fails to start (visible as a crash in `docker logs`/Railway's
# deploy log), rather than silently serving a broken app.
#
# Idempotent and cheap when there's nothing new to apply - real, verified
# end-to-end locally (see the project's own commit history / PR that added
# this). If you deploy this image with the same DATABASE_URL to a
# *separate* platform that already has its own pre-deploy/release-phase
# hook (Railway does - see railway.toml's `releaseCommand`, which bypasses
# this entrypoint entirely via its own `startCommand`), that platform's own
# hook is the better place to run migrations (once, before traffic cuts
# over) - this script is the fallback for everyone else, not a replacement
# for a real release phase where one exists.
#
# Known limitation: this has no distributed lock around the migration
# step. Running a single instance of this image (the default/common
# self-hosted shape) is safe. If you scale this exact image to multiple
# replicas with no orchestrator-level release-phase step of your own,
# concurrent migration attempts on boot could race - either add one
# (Postgres advisory lock around the migrate() call) or make sure only one
# replica/an init container runs migrations in that setup.
set -e

echo "[docker-entrypoint] Running database migrations..."
node packages/db/dist/migrate.mjs

# Docs (apps/docs) run as a second, internal-only process on 3001 - never
# exposed directly (no EXPOSE 3001, no public port mapping needed for it).
# apps/web's own next.config.mjs rewrites /docs/* to
# http://127.0.0.1:3001/docs/* (DOCS_INTERNAL_URL, defaults to that same
# address), so the one publicly exposed port (3000) serves both. Started
# with `&`, not `exec`, so PID 1 stays the web server below and correctly
# receives SIGTERM - if this background process dies, the container itself
# doesn't (a known, accepted trade-off of not pulling in a real init/process
# supervisor for a single secondary process: the app keeps serving, /docs
# just 502s until the next restart).
echo "[docker-entrypoint] Starting docs server..."
PORT=3001 HOSTNAME=0.0.0.0 node apps/docs/server.js &

echo "[docker-entrypoint] Starting web server..."
exec node apps/web/server.js
