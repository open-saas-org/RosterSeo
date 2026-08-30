## What does this PR do?

<!-- One or two sentences. Link the issue it closes, if any (Closes #123). -->

## Why

<!-- The "why," not just the "what" - especially for anything touching RLS, auth, or billing. -->

## How was this tested?

<!-- pnpm typecheck / pnpm lint / pnpm test, plus any manual verification. -->

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] No mock/fabricated data introduced in a real code path (see `CONTRIBUTING.md`) - a failed/unconfigured integration renders an honest "not connected" state, never a plausible-looking fake number
- [ ] `.env.example` updated if this adds a new environment variable
