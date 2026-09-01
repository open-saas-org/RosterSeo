# RosterSEO

Open-source SEO + AI-search-visibility platform. Combines a Screaming
Frog–style crawler/auditor, a keyword/SERP/competitor research suite, and
an AI-answer-engine (ChatGPT/Gemini/Perplexity) brand-visibility tracker,
plus GSC/GA4 integration so recommendations are grounded in your site's
real performance data — not just estimated SERP data.

Architecture and rationale: [ARCHITECTURE.md](./ARCHITECTURE.md), also
published as browsable docs in `apps/docs` (see below).

**Status**: real signup/login, a working dashboard across three pillars —
SEO (Page Analyzer, Keyword Research, Site Audit, Rank Tracking,
Competitors, AI Visibility, Local SEO), Publish (multi-platform blog
publishing), and Social — all backed by real auth-protected API routes and
Postgres persistence with row-level tenant isolation. Every integration is
a real API call, never mock/fabricated data: DataForSEO for SERP/keyword/
backlink data, BrightData + OpenRouter for AI-answer-engine visibility
tracking, Google PageSpeed for Core Web Vitals, and full GSC/GA4/Merchant
Center OAuth sync — each one is simply inert (and renders an honest "not
connected" state) until you set its API keys/credentials in `.env`. See
`.env.example` for the full list; nothing in the app fabricates a
plausible-looking number when a real integration isn't configured.

## How this runs today

**Self-hosted (`SELF_HOSTED=true`)** — single-tenant, no billing, you bring
your own DataForSEO/LLM API keys. This is the standard open-source
self-host distribution model, and the only mode that actually exists in
the code right now.

**Planned: hosted SaaS (`SELF_HOSTED=false`)** — a multi-tenant, Stripe-billed
hosted mode is on the roadmap, not implemented yet. `SELF_HOSTED` isn't
read anywhere in the app today, and there's no Stripe integration in the
codebase — treat any mention of hosted mode elsewhere as forward-looking,
not something you can flip on now.

## Quick start (local dev)

Requires Node 22.13+ (pnpm 11 itself needs it), pnpm, and a Postgres instance (local install, or a free
one from Railway/Neon/Supabase — Docker is not required for this path).

```bash
cp .env.example .env    # fill in DATABASE_URL at minimum
pnpm install
pnpm db:migrate
pnpm dev
```

`apps/web` runs on `http://localhost:3000` — visit `/signup` to create your
first account (this also creates your organization and prompts you to
create your first project).

Database setup, including the two-role RLS requirement, is documented in
[packages/db/README.md](./packages/db/README.md) — read it before your
first `pnpm db:migrate`, the default single-role setup silently disables
tenant isolation.

## Self-host via Docker

**Docker Compose** (app + a real local Postgres, good for trying it out):

```bash
cp .env.example .env
docker compose up --build
```

Migrations run automatically on container start (see
`docker/docker-entrypoint.sh`) — nothing to run by hand.

**Prebuilt image**, against a Postgres you already have (a managed
instance, another container, whatever) — this is the plain "run it
anywhere" path for a VPS, Fly.io, Render, or any other Docker-based host
that isn't Railway. Every push to `main` publishes a real image via
[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)
— no local build step needed:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@your-postgres-host:5432/rosterseo" \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -e BETTER_AUTH_URL="http://localhost:3000" \
  -e NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000" \
  ghcr.io/open-saas-org/rosterseo:latest
```

Prefer to build it yourself instead (e.g. to test an uncommitted change)?
`docker build -t rosterseo-web .` then swap the image name above for
`rosterseo-web`.

Same automatic migration-on-start behavior either way — the image
migrates the database it's pointed at, then serves the app, every time it
boots. See `.env.example` for every other variable (DataForSEO, AI
providers, OAuth, etc.) — all optional beyond the ones above, each one
just stays inert until you set it.

## Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template)

<!--
  Replace the badge link above with your real template URL once it's
  published (Railway dashboard -> Project Settings -> Create Template) -
  see docker/RAILWAY.md for the one-time publishing steps. `railway.toml`
  in this repo already handles the build (Dockerfile) and the one-time
  database migration (`releaseCommand`) - a deployer only needs to attach
  a Postgres plugin and fill in the env vars Railway prompts for.
-->

Railway builds `Dockerfile` and runs the real Drizzle migrations
automatically on every deploy (`railway.toml`'s `releaseCommand`) — attach
a **PostgreSQL** plugin, set the required variables from `.env.example`
(`SELF_HOSTED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATAFORSEO_LOGIN`/
`DATAFORSEO_PASSWORD`, plus whichever AI-provider keys you want enabled),
and it comes up with a fully migrated schema, no manual step required. See
[docker/RAILWAY.md](./docker/RAILWAY.md) for the one-time steps to publish
this as an actual "Deploy on Railway" button/template.

## Monorepo layout

```
apps/
  web/          Next.js dashboard + API routes (Better-Auth; Stripe billing planned, not yet implemented)
  worker/       pg-boss job consumer (crawls, SERP pulls, AI-visibility runs)
  mcp-server/   MCP server exposing project data to external AI tools
  docs/         Fumadocs documentation site (per-feature docs, architecture)
packages/
  db/           Drizzle ORM schema + migrations (Postgres) + RLS tenant isolation
  jobs/         Shared pg-boss job definitions (enqueue from web, process in worker)
  dataforseo/   DataForSEO API client (SERP, keywords, crawl, backlinks)
  ai-visibility/ Multi-provider LLM prompt-sampling for brand visibility
  google/       GSC + GA4 + GBP + Merchant Center + Gmail OAuth and incremental sync
  crawler/      Shared single-page fetch+parse (Site Audit's BFS crawl and Page Analyzer)
  bing/         Bing Webmaster Tools client (single global API key, no OAuth)
  wordpress/    WordPress Application Password client (connect + verify + list posts)
  indexnow/     IndexNow protocol client (Bing/Yandex/Seznam/Naver instant-index pings)
  shopify/      Shopify Connect + agent write-back
  email/        SMTP + Gmail OAuth send, used by Backlink Outreach
  publishing/   Blog adapters (WordPress, Ghost, Tumblr, Dev.to, Hashnode, Webflow, Shopify, HubSpot, Blogger) + OAuth
  social/       Social adapters (Bluesky, Mastodon, LinkedIn, Pinterest, Facebook, Instagram, Threads, X) + OAuth
docker/         Dockerfile support docs, Railway publishing steps
```

## Documentation site

`apps/docs` (Fumadocs) publishes per-feature docs and ARCHITECTURE.md as
browsable docs:

```bash
pnpm --filter @rosterseo/docs dev
```

Runs on `http://localhost:3001`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, code conventions,
and the PR checklist. Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
too. Found a security issue? See [SECURITY.md](./SECURITY.md) — please
don't open a public issue for those.

## License

MIT — see [LICENSE](./LICENSE).
