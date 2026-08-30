# @rosterseo/mcp-server

MCP server exposing project data and real live SEO lookups to external AI
tools (Claude Desktop, other MCP clients), per PRD Section 5.8.

**Status**: real, auth-required tool set across every module - Projects,
Rank Tracking, Site Audit, Competitors, AI Visibility, Page Analyzer,
Keyword Research, Backlinks/Domain Research, Local SEO, and Bing/IndexNow.
See `src/index.ts`'s `TOOLS` array for the exact list (kept in sync with
the app's `/ai-mcp` page).

## Auth

Every tool call requires a real `ROSTERSEO_API_KEY` env var - generate one
from the app's **AI & MCP** settings page (shown once at creation, only its
hash is stored). The key resolves to the account that generated it; every
DB-backed tool runs inside that account's `withUserContext(...)` (the same
RLS-backed scoping every browser request in the app uses), so a key can
only ever read or act on projects its account actually has access to.
There is no bypass - a request with a missing/invalid/revoked key refuses
to start (stdio) or every tool call fails with an explicit error.

Live, non-project-scoped lookups (`research_keywords`, `get_keyword_metrics`,
`get_serp_results`, `get_backlinks_overview`, `get_domain_overview`) still
require a valid key to reach the handler at all, even though they don't
read/write a specific project.

## Running

```bash
# from repo root, with ROSTERSEO_API_KEY set (shell env or ../../.env)
pnpm --filter @rosterseo/mcp-server dev
```

Or point a Claude Desktop config at it - see the app's AI & MCP page for
the exact `claude_desktop_config.json` snippet with your generated key.

## Known gaps (not yet built)

- No GSC/GA4/Merchant Center tools - those need per-project OAuth token
  refresh (`apps/web/lib/google-token.ts`), which lives in `apps/web` and
  isn't cleanly reachable from this standalone server without duplicating
  that logic. A future pass could add it as a small package-level helper.
- No "trigger a background job" tools (run a full site audit, run a rank
  check, run a local grid scan) - those go through `apps/worker`'s job
  queue, not a direct DB write, so wiring them here would mean either
  duplicating orchestration logic or adding an HTTP call path into
  `apps/web`. Read-only + simple-insert tools only for now.
- No rate limiting or per-key scope restriction (a key can call every tool
  the account has data for) - fine for the self-hosted, single-operator
  model this is built around; would need more work before offering this to
  untrusted third parties in a hosted multi-tenant deploy.
