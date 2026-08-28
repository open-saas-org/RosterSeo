# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Please report it privately via
[GitHub Security Advisories](https://github.com/open-saas-org/seo/security/advisories/new)
for this repository. This lets us confirm, fix, and coordinate a disclosure
before the details are public.

Include, if you can:
- The affected version/commit
- Steps to reproduce (or a proof of concept)
- What you think the impact is (data exposure, auth bypass, RCE, etc.)

We'll acknowledge real reports as soon as we can and keep you updated as a
fix is worked on. There's no bug bounty program at this time.

## Scope

This is a self-hostable, open-source application. In scope:
- Authentication/authorization bugs (Better-Auth integration, session
  handling, org/project access checks)
- Row-Level-Security (RLS) bypass — see `packages/db/README.md` for the
  tenant-isolation model this depends on
- SSRF in the crawler (`packages/crawler/src/ssrf-guard.ts` exists
  specifically to prevent this — a real bypass is a real finding)
- Secrets handling (anything that could leak API keys/tokens/`DATABASE_URL`)
- Injection (SQL, command, template) in any real code path

Generally out of scope:
- Issues that only reproduce with a self-hosted instance deliberately
  misconfigured against this repo's own documented setup (e.g. running the
  database connection as a superuser despite `packages/db/README.md`
  explicitly warning against it)
- Missing rate limiting on non-authentication endpoints
- Third-party API keys/credentials the operator chose to configure —
  DataForSEO, BrightData, OpenRouter, Stripe, and every OAuth provider
  listed in `.env.example` are the operator's own accounts; this project
  isn't responsible for how those providers handle the requests it makes
  on the operator's behalf

## Supported versions

This project doesn't yet have tagged releases — security fixes land on
`main`. Once versioned releases exist, this section will list which are
still receiving fixes.
