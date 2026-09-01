# Builds apps/web for production. Run from the repo root:
#   docker build -t rosterseo-web .
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
# Every real workspace member's manifest, not a hand-picked subset - the
# lockfile was generated against ALL of these, and `--frozen-lockfile`
# validates the on-disk workspace matches it exactly. A previous version of
# this file only copied 7 of the (currently) 17 real apps/packages
# manifests, which would fail `pnpm install --frozen-lockfile` the moment
# someone actually tried building this image. If you add a new app or
# package to the workspace, add its package.json here too, or this build
# breaks again the same way.
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/dataforseo/package.json packages/dataforseo/package.json
COPY packages/ai-visibility/package.json packages/ai-visibility/package.json
COPY packages/google/package.json packages/google/package.json
COPY packages/shopify/package.json packages/shopify/package.json
COPY packages/crawler/package.json packages/crawler/package.json
COPY packages/bing/package.json packages/bing/package.json
COPY packages/wordpress/package.json packages/wordpress/package.json
COPY packages/indexnow/package.json packages/indexnow/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages/publishing/package.json packages/publishing/package.json
COPY packages/social/package.json packages/social/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages ./packages
COPY . .
RUN pnpm --filter @rosterseo/web build
# Docs (apps/docs) builds to its own standalone server.js too - served at
# /docs on the SAME public port as the app above via apps/web's next.config
# rewrites (Next.js "Multi Zones"), not a separate exposed port/subdomain.
# See docker-entrypoint.sh for how both processes actually get started.
RUN pnpm --filter @rosterseo/docs build
# Bundles packages/db's real migration script (drizzle-orm's migrator, no
# CLI/dev-tool dependency) into one self-contained ESM file with only
# Node's own built-ins left external - see packages/db/package.json's
# "build" script. This is what makes `railway.toml`'s releaseCommand able
# to run real migrations from the lean runner stage below, which otherwise
# ships none of the source/tooling needed to run `pnpm db:migrate` directly.
RUN pnpm --filter @rosterseo/db build

FROM base AS runner
ENV NODE_ENV=production
# Next's standalone server.js binds to `process.env.HOSTNAME || "0.0.0.0"` -
# harmless-looking, except it means an unset HOSTNAME (the default on every
# container runtime that doesn't happen to export one) falls through to
# whatever the shell/OS resolves as the hostname, which inside a container
# is its own container ID - a real, reachable-sounding value the server
# logs as ready, but bound to an interface nothing outside the container
# can reach. Confirmed live: identical image, identical port, 502
# "Application failed to respond" on Railway until this was set explicitly -
# the fix isn't platform-specific, so it belongs here, not in one host's
# dashboard config.
ENV HOSTNAME=0.0.0.0
WORKDIR /repo
# outputFileTracingRoot is set to the monorepo root, so standalone output
# mirrors the full apps/web/... path rather than flattening to the root.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# Docs' own standalone output, layered into the same image root - its
# server.js ends up at ./apps/docs/server.js alongside web's at
# ./apps/web/server.js, each started as its own process (see
# docker-entrypoint.sh). .next/static needs the same manual copy Next's
# standalone output always needs (it's never included automatically) -
# same reason apps/web needs the identical line above.
COPY --from=build /repo/apps/docs/.next/standalone ./
COPY --from=build /repo/apps/docs/.next/static ./apps/docs/.next/static
# The bundled migration script + its raw .sql migration files (read at
# runtime via a path relative to the compiled file - see
# packages/db/src/migrate.ts) - this is the whole reason releaseCommand in
# railway.toml can run `node packages/db/dist/migrate.mjs` against this
# same lean image instead of needing a separate migration container, and
# the whole reason the entrypoint below can migrate-then-serve for anyone
# deploying this image outside Railway.
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/packages/db/drizzle ./packages/db/drizzle
COPY docker/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
# Default: migrate, then serve (see docker/docker-entrypoint.sh) - this is
# what makes `docker run -e DATABASE_URL=... rosterseo-web` (or a
# docker-compose/Fly.io/Render/plain-VPS deploy with no separate
# release-phase step) come up against a fully migrated schema on its own,
# no manual `pnpm db:migrate` required. Railway does NOT use this path -
# railway.toml's explicit startCommand overrides this entirely and its own
# releaseCommand runs the same migration once, before cutover, which is
# the objectively better place for it when that mechanism exists.
ENTRYPOINT ["./docker-entrypoint.sh"]
