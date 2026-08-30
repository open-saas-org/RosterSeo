# Contributing to SEO Tool

Thanks for considering a contribution. This is a real, working monorepo —
issues and PRs against real bugs, real missing features, and real
integrations are all welcome.

## Before you start

- **Bug fixes / small improvements**: just open a PR.
- **New features or anything that changes existing behavior**: please open
  an issue first to discuss the approach before writing code. This project
  has a strong "no fabricated/mock data in real code paths" convention (see
  `ARCHITECTURE.md`) — a design discussion up front saves a rewrite later.
- **Security issues**: do not open a public issue. See [SECURITY.md](./SECURITY.md).

## Development setup

```bash
cp .env.example .env    # fill in DATABASE_URL at minimum
pnpm install
pnpm db:migrate
pnpm dev
```

Requires Node 22.13+ (pnpm 11 itself needs it) and pnpm (`packageManager` in `package.json` pins the
exact version corepack will use). See the main [README](./README.md) for
the full quick-start, and [packages/db/README.md](./packages/db/README.md)
before your first `pnpm db:migrate` — the two-role RLS setup there is easy
to get wrong.

## Before opening a PR

```bash
pnpm typecheck   # tsc --noEmit across every workspace package
pnpm lint
pnpm test
```

All three must pass. If you touched a specific package/app, you can scope
any of these with `pnpm --filter @seo-tool/<name> <script>` for a faster
loop while iterating.

## Code conventions

- **No mock/fabricated data in a real code path.** If a real API call
  fails or isn't configured, return/render an honest "not connected" or
  "data not found" state — never a plausible-looking fake number. This is
  enforced by convention and code review, not a lint rule, so it's the one
  thing worth over-explaining in a PR description if it's not obvious.
- Real, working env vars only — `.env.example` is the source of truth for
  every variable the app reads; keep it in sync when you add one.
- Match the existing package boundaries (`packages/*` are framework-free
  API clients / shared logic; `apps/web` is the only place that talks to
  the database directly from request-handling code). See `ARCHITECTURE.md`.

## Commit / PR style

- Keep PRs scoped to one change. A drive-by fix bundled into an unrelated
  feature PR makes both harder to review.
- Reference the issue you're closing, if any.
- A short "why," not just "what," in the PR description — especially for
  anything touching RLS, auth, or billing (`SELF_HOSTED=false` mode).

## License

By contributing, you agree your contributions are licensed under this
project's [MIT License](./LICENSE).
