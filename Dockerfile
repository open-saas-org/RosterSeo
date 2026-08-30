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
# Bundles packages/db's real migration script (drizzle-orm's migrator, no
# CLI/dev-tool dependency) into one self-contained ESM file with only
# Node's own built-ins left external - see packages/db/package.json's
# "build" script. This is what makes `railway.toml`'s releaseCommand able
# to run real migrations from the lean runner stage below, which otherwise
# ships none of the source/tooling needed to run `pnpm db:migrate` directly.
RUN pnpm --filter @rosterseo/db build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /repo
# outputFileTracingRoot is set to the monorepo root, so standalone output
# mirrors the full apps/web/... path rather than flattening to the root.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
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
