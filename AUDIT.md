# RosterSEO — Page-by-Page Product, UX & Code Audit

This audit covers every page in `apps/web/app` (45 pages total), evaluating **pending/incomplete code & bugs**, **UI/UX friction**, **functionality gaps**, and a **Product Manager assessment** (whether each page earns its place or creates crowding).

---

## Executive Summary: Product & Architecture Verdict

### 1. Where the Product Is Crowded / Fragmented
1. **AI Visibility (11 routes → should be ~4–5):**
   - `Overview` (`/ai-visibility/overview`), `Visibility` (`/ai-visibility/visibility`), and `Share of Voice` (`/ai-visibility/share-of-voice`) heavily overlap. `Overview` has no "Run check" controls; `Share of Voice` has only 2 cards + 1 table.
   - `Prompts` (`/ai-visibility/settings/prompts`), `Brand` (`/ai-visibility/settings/brand`), and `Providers` (`/ai-visibility/settings/providers`) are three separate settings pages, with `Brand` and `Providers` promoted into the global top bar (`navTopBar`) alongside global app utilities.
   - **Recommendation:** Merge `Overview` + `Visibility` + `Share of Voice` (tab); combine `Brand` + `Providers` (+ `Prompts` or keep Prompts as a drawer/tab) into one tabbed `/ai-visibility/settings` page; remove `Brand` and `Providers` from the global top bar.
2. **Insights (4 routes → Bing & Merchant are thin):**
   - `GSC Insights` and `GA Insights` are rich, core SEO views. `Bing Insights` (1 chart + 1 daily table, unverified live) and `Merchant Insights` (shopping-ads aggregates, not SEO) are too thin for top-level sidebar slots.
3. **Local SEO (3 routes → Optimize is too thin):**
   - `Profile` and `Monitor` (geo-grid rank map) are strong. `Optimize` is a single LLM checklist button that belongs as a tab inside `Profile` or `Monitor`.
4. **Site Audit Sub-Pages (`[auditId]/deep-check` and `[auditId]/pages/[pageId]`):**
   - `Deep Check` is a standalone route for 3 issue lists that belong as a 3rd tab on `SiteAuditDetail`.
   - `Page Detail` duplicates the same `issues` list three times and shows *less* data/actions than a single row in `SiteAuditPagesTable`.
5. **Global Top Bar (`navTopBar`) Leakage in SaaS Mode:**
   - `Competitors` is duplicated in both the sidebar and top bar.
   - `Spend` queries deployment-wide `providerSpendLog` (leaking instance-wide API spend in multi-tenant `SELF_HOSTED=false` mode).
   - `AI & MCP` hardcodes local monorepo `pnpm` / `localhost:5432` commands, unusable for hosted SaaS customers.

### 2. High-Priority Bugs & Security/Billing Gaps Found
- **`brand-lookup/actions.ts` (`lookupBrandAction`)**: Server Action has **no `auth.api.getSession()` check** and **no `checkAndIncrementUsage`**, despite calling live paid LLM APIs.
- **`local-seo/monitor` (`monitor-workspace.tsx`)**: `configDirty` only checks `keyword`, ignoring `gridSize`/`radiusKm`/`autoTrackEnabled` — clicking "Run now" after changing grid size runs the scan with the old DB config.
- **`competitors/[id]` (`competitor-detail-page.tsx`)**: Calls `fetchCompetitorSnapshot` with `initialCompetitor.domain` instead of `competitor.domain`, so editing a domain and clicking Rescan scans the old domain.
- **`ai-visibility/visibility` (`run/route.ts`)**: `hasPrompts` checks total prompts instead of `enabled` prompts — running with all prompts paused increments usage before running 0 samples.
- **`ai-visibility/query-fan-out`**: Server pre-filters rows to `webQueries.length > 0`, making `Prompt Runs w/ Unknown Queries` always `0`.
- **`ai-visibility` charts (`PromptTrendChart` & `ShareOfVoice`)**: Uses `--color-${domain}` CSS variables containing dots (invalid CSS), and `ShareOfVoice` leaderboard assigns `--chart-1` to both the brand and the #1 competitor.
- **`settings/billing` & `pricing`**: Closing the Cashfree modal without redirecting leaves buttons stuck on `"Redirecting…"`; `Cancel` runs immediately with no confirmation dialog; `BANK_APPROVAL_PENDING` is treated as `"active"`.
- **Dashboard Home (`/`), Insights (`gsc`/`ga`/`bing`/`merchant`)**: Insights helpers use `Math.floor(rows.length / 2)` (skewing odd-day comparisons like 7d); Dashboard Home runs ~10 serial awaits on SSR and silently displays `0` when integrations are disconnected or fail.

---

## Part 1: Auth, Standalone & Dashboard Home

### 1. `/login` (`app/(auth)/login/page.tsx` + `components/login-form.tsx`)
- **Pending / Bugs:** No `try/catch` around `authClient.signIn.email(...)` (network errors freeze `isSubmitting`); doesn't redirect already-authenticated users away from `/login`; hardcodes `router.push("/")` (ignores `redirect` query param set by `middleware.ts`!).
- **UI/UX:** No password visibility toggle; no "Forgot password?" link.
- **Functionality Gaps:** Email/password only (no password reset, magic link, or OAuth).
- **PM Verdict:** **Keep** — clean & minimal; wire up `redirect` param and `try/catch`.

### 2. `/signup` (`app/(auth)/signup/page.tsx`)
- **Pending / Bugs:** Missing `try/catch` around `authClient.signUp.email(...)`; no existing-session redirect; `minLength={8}` relies on silent native browser validation.
- **UI/UX:** No password requirement hint, visibility toggle, or Terms/Privacy notice for SaaS mode.
- **Functionality Gaps:** No OAuth/SSO, email verification UI, or org invite support.
- **PM Verdict:** **Keep** — solid, just needs error/validation polish and SaaS legal links.

### 3. `/onboarding` (`app/onboarding/page.tsx`)
- **Pending / Bugs:** `POST /api/projects` is outside `try/catch` (freezes `isSubmitting` on network error); Step 2 `Promise.all` ignores `!res.ok` on competitor/prompt creation; `additionalDomains` & `aliases` from AI research are never saved; `<Suspense fallback={null}>` flashes blank on hydration.
- **UI/UX:** Shows `"Step 1 of 2"` even when AI research returns `null` and skips Step 2; `targetLocation` is a free-text input; Step 2 lacks Select All, inline editing, or Back button.
- **Functionality Gaps:** No optional GSC/GA4 connect step.
- **PM Verdict:** **Keep** — AI pre-seeding is a great differentiator; fix error handling and step indicator.

### 4. `/pricing` (`app/pricing/page.tsx` + `components/billing/pricing-cards.tsx`)
- **Pending / Bugs:** `loadingPlanId` never resets if Cashfree checkout modal closes without redirect; `cancelSubscription` has no confirmation dialog; active paid users clicking another plan create a second subscription rather than switching plans.
- **UI/UX:** Heading always says `"Upgrade your plan"` even for Agency users; `free`/`trial` limits aren't shown for comparison.
- **Functionality Gaps:** No plan-switch/proration flow, no monthly/yearly toggle, no inline usage summary.
- **PM Verdict:** **Keep** (hosted SaaS only) — clean full-screen layout; add cancel confirmation and modal-close recovery.

### 5. `/reports/ai-visibility/[projectId]` (`app/reports/ai-visibility/[projectId]/page.tsx`)
- **Pending / Bugs:** `shareOfVoice`/`perPrompt`/`contentGap` use `latestRows`, while `topCitedDomains` aggregates all historical runs; `ReportShareButton` uses native `confirm()` and has no retry on load error.
- **UI/UX:** Print CSS sets white background without overriding dark-mode text variables; no "Back to AI Visibility" link for logged-in owners.
- **Functionality Gaps:** No model breakdown, historical trend comparison, or CSV export.
- **PM Verdict:** **Keep** — high-value client deliverable; align data scope and fix dark-mode print styles.

### 6. `/` Dashboard Home (`app/(dashboard)/page.tsx` + `components/dashboard/*`)
- **Pending / Bugs:** ~10 serial `await`s on SSR (including live DataForSEO backlinks fetch on cache miss); top KPI cards silently fall back to `0` when disconnected; `"Organic Keywords"` KPI actually counts `trackedKeywords` (manual rank list); `shareOfVoicePercent` uses a different formula than AI Visibility.
- **UI/UX:** 7 cards in `xl:grid-cols-3` leaves 1 orphan card; unconfigured integrations (Bing, Merchant, GBP) occupy full-size grid cards; top 4 KPIs aren't clickable links.
- **Functionality Gaps:** No Rank Tracking summary card in the grid.
- **PM Verdict:** **Fix & Declutter** — parallelize/stream data, hide unconfigured optional integrations into a compact setup strip, and stop showing `0` for disconnected APIs.

---

## Part 2: SEO Pillar — My Site

### 7. `/site-audit` (`app/(dashboard)/site-audit/page.tsx` + `components/site-audit/*`)
- **Pending / Bugs:** Single-audit-per-project model overwrites history; `<IndexNowSubmitAction />` expands a full `<Card>` *inside* the flex toolbar row, breaking layout; `SiteAuditPagesTable` copies `initialPages` into `useState` (goes stale on recrawl) and silently swallows save/recrawl errors; `handleCancel` uses `confirm()`.
- **UI/UX:** Pages tab stacks 2 toolbars over a 20-column horizontal-scroll table; `Issues` tab lacks search, category filter, and links to `[pageId]`; separate `Export` vs `CSV` buttons.
- **Functionality Gaps:** No audit history/score trend over time.
- **PM Verdict:** **Keep & Simplify** — trim default columns (move extras to a row drawer), fix `IndexNowSubmitAction` layout, and absorb `Deep Check` as a tab.

### 8. `/site-audit/[auditId]/deep-check` (`deep-check/page.tsx` + `site-audit-deep-check.tsx`)
- **Pending / Bugs:** `handleRun` has no `res.ok` check or loading state; `useQuery` ignores errors (infinite spinner); `"failed"` status falls through to `"Not run yet"`.
- **UI/UX:** Unpaginated flat lists; no visual cue distinguishing clickable vs non-clickable rows.
- **Functionality Gaps:** No CSV export or error banner.
- **PM Verdict:** **Consolidate** — move into `SiteAuditDetail` as a 3rd tab (`Overview` / `Issues` / `Pages` / `Deep Check`).

### 9. `/site-audit/[auditId]/pages/[pageId]` (`pages/[pageId]/page.tsx` + `site-audit-page-detail.tsx`)
- **Pending / Bugs:** Duplicate React keys (`key={link.targetUrl}`, `key={url}`) if a page links to the same URL twice; `h1Count` fetched but unused; back link hardcodes `tab=pages` even when opened from `deep-check`.
- **UI/UX:** Renders the same `issues` array 3 times (all issues + cannibalization subset + broken links subset); link lists aren't clickable.
- **Functionality Gaps:** Shows *less* than the Pages table row (missing meta description, canonical, H2s, GSC/GA4 metrics, Action/Notes, Recrawl).
- **PM Verdict:** **Redundant / Thin** — either turn into a rich Inspector drawer/page with full metadata + Recrawl, or remove duplication.

### 10. `/page-analyzer` (`app/(dashboard)/page-analyzer/page.tsx` + `components/page-analyzer/*`)
- **Pending / Bugs:** Ignores `useSWR` error on history; `data!.report.result!` non-null assertion risks crash on unexpected status; `handleReanalyze` only logs to console; `"Tracked"` prompt state resets on reload.
- **UI/UX:** `Download PDF` (`window.print()`) only prints the active tab instead of the full report; `targetLocation` is free-text; `CrawlSummary` repeats URL/volume already in the header.
- **Functionality Gaps:** No `"Track keyword"` action in Keyword Opportunities; no history search/delete/retry.
- **PM Verdict:** **Keep** — flagship feature, well-organized 4-tab layout; fix print view and add keyword tracking.

### 11. `/rank-tracking` (`app/(dashboard)/rank-tracking/page.tsx` + `components/rank-tracking/*`)
- **Pending / Bugs:** SSR `INSERT` into `rankTrackingSettings` on GET render; `handleCheckRank` swallows errors (`catch {}`); `handleUntrack`/`handleBulkUntrack` lack error rollback; `selectedIds` persists across filter changes; `minPosition: "0"` treated as empty; `AddKeywordsDialog` closes immediately so success message is never seen; `"Weekly"` schedule is saved in DB but not automated; `RankTrackingConfigDialog` doesn't pre-populate Country/State/City.
- **UI/UX:** 220px empty box when `< 2` checks; `checkedAt` is exported to CSV but hidden in the table.
- **Functionality Gaps:** Automated weekly runs, per-keyword rank history drawer, `maxTrackedKeywords` plan limit enforcement (`ROADMAP.md` open item).
- **PM Verdict:** **Keep** — clean workflow; fix dialog/selection bugs and show `Last checked` in table.

---

## Part 3: SEO Pillar — Insights

### 12. `/gsc-insights` (`app/(dashboard)/gsc-insights/page.tsx` + `components/gsc-insights/*`)
- **Pending / Bugs:** Any API error is conflated with `needs_reconnect`; `summarizeSearchConsoleRows` splits odd-length arrays unevenly (`Math.floor(len / 2)`); `ctrChange` and `avgPosition` are unweighted across days; `handleDaysChange` lacks `AbortController`.
- **UI/UX:** Duplicate `PageHeader`; no table search/CSV export; no UI to switch GSC property once chosen.
- **Functionality Gaps:** Cannot promote Striking Distance queries to Rank Tracking or Keyword Research.
- **PM Verdict:** **Keep** — core reporting page; Striking Distance tab is high value.

### 13. `/ga-insights` (`app/(dashboard)/ga-insights/page.tsx` + `components/ga-insights/*`)
- **Pending / Bugs:** Same `needs_reconnect` conflation, odd-day half-split bug, unweighted `avgDuration`, and missing `AbortController`; **does not sort `trend` by date** before summarizing.
- **UI/UX:** Landing pages are plain text (not clickable); chart only plots `sessions`; no search/CSV export.
- **Functionality Gaps:** Organic-only with no share-of-total-traffic context.
- **PM Verdict:** **Keep** — strong complement to GSC Insights.

### 14. `/bing-insights` (`app/(dashboard)/bing-insights/page.tsx` + `components/bing-insights/*`)
- **Pending / Bugs:** Header comment notes *"not yet confirmed live against a real key"*; same odd-day split and missing `AbortController`; no UI to change/clear `bingSiteUrl` once set; no retry button on fetch error.
- **UI/UX:** Very sparse (4 KPIs, 1 chart, 1 daily table).
- **Functionality Gaps:** No query-level or page-level Bing breakdowns.
- **PM Verdict:** **Consolidate** — too thin for a top-level sidebar item; fold into a Search Performance tab or expand with query/page data.

### 15. `/merchant-insights` (`app/(dashboard)/merchant-insights/page.tsx` + `components/merchant-insights/*`)
- **Pending / Bugs:** SSR collapses `api_not_enabled` (403) into `"needs reconnecting"`; client `handleDaysChange` ignores JSON error details; displays numeric `propertyId` instead of account name; same odd-day split.
- **UI/UX:** Minimal daily-only view; no search/export/account switcher.
- **Functionality Gaps:** No product-level performance, feed diagnostics/disapprovals, revenue, or ROAS.
- **PM Verdict:** **Remove or Consolidate** — paid shopping-ads aggregates feel out of place in an SEO/Content/Social sidebar without product-feed diagnostics.

---

## Part 4: SEO Pillar — Research

### 16. `/keyword-research` (`app/(dashboard)/keyword-research/page.tsx` + `components/keywords/*`)
- **Pending / Bugs:** Swallows geo fetch errors (stuck on `"Loading…"`); `selectedIds` isn't cleared between searches; clicking Recent Searches logs a duplicate DB search and delays updating input state; `monthLabels()` anchors to `new Date()` instead of real months; cached seed metrics hardcode `competition: null`.
- **UI/UX:** Recent Searches card disappears once results load with no way to reopen it; SERP panel re-fetches on every click without caching.
- **Functionality Gaps:** SERP panel doesn't highlight `project.domain`; no keyword lists/grouping.
- **PM Verdict:** **Keep** — strong core workflow; keep history accessible via a drawer/popover.

### 17. `/backlinks` (`app/(dashboard)/backlinks/page.tsx` + `components/backlinks/*`)
- **Pending / Bugs:** 7-day cache has no "Force refresh" button or `fetchedAt` timestamp; `addedUrls` is local state (resets on reload instead of reading `outreachTargets`); `POST /outreach` errors are silently ignored; search ignores `urlFrom`.
- **UI/UX:** Prominent warning Alert on every lookup; no one-click button for `project.domain`; no CSV export.
- **Functionality Gaps:** Missing `urlTo` (target page), anchor distribution, and competitor backlink comparison.
- **PM Verdict:** **Keep** — great bridge to Outreach; persist `"Added"` state and add CSV export + project domain shortcut.

### 18. `/outreach` (`app/(dashboard)/outreach/page.tsx` + `components/outreach/*`)
- **Pending / Bugs:** Queued emails (`status: "queued"`) never poll/update to `"sent"`/`"failed"` without manual reload; `sent`/`queued` targets remain editable; manual `"Find email"` drops `contactEmailSource`; `dailySendLimit` is read-only; delete/remove errors silently ignored.
- **UI/UX:** Full SMTP sender setup panel sits permanently at the top of the page, crowding daily outreach; no status filter (`New`, `Drafted`, `Sent`, `Failed`) or search.
- **Functionality Gaps:** Email templates, follow-up sequences, daily send cap enforcement, SMTP test button.
- **PM Verdict:** **Keep & Clean Up** — move sender config into a collapsible/Settings sheet and add status filters + polling.

### 19. `/competitors` (`app/(dashboard)/competitors/page.tsx` + `components/competitors/*`)
- **Pending / Bugs:** `handleAdd` appends to end while SSR orders newest-first; `"Rescan"` silently hits 7-day cache instead of refreshing; `handleRemove` uses `confirm()` and swallows errors; `isSavingEdit` is shared across all cards.
- **UI/UX:** Stacked cards with no side-by-side comparison table and no `project.domain` baseline; no `"Scan all"`; **duplicated in both sidebar and top bar**.
- **Functionality Gaps:** No AI Visibility mention % shown on cards.
- **PM Verdict:** **Keep & Deduplicate Nav** — remove from top bar, add comparison table with own domain.

### 20. `/competitors/[id]` (`competitors/[id]/page.tsx` + `competitor-detail.tsx`)
- **Pending / Bugs:** **Scans `initialCompetitor.domain` instead of edited `competitor.domain`**; `"Rescan"` hits 7-day cache; `confirm()` + silent delete errors.
- **UI/UX:** Duplicates `Referring domains` and `Domain rating` in both top KPI grid and `"Backlink profile"` card below.
- **Functionality Gaps:** `"Keyword gap ideas"` is just 8 ranked keywords for the competitor (no actual gap diff against `project.domain`, no `"Track"` button); no CSV export.
- **PM Verdict:** **Keep & Fix** — fix domain bug, remove duplicate metrics, and add real keyword gap diffing + Track buttons.

### 21. `/brand-lookup` (`app/(dashboard)/brand-lookup/page.tsx` + `components/brand-lookup/*`)
- **Pending / Bugs:** **`lookupBrandAction` has no `auth.api.getSession()` check and no usage/spend check**; renders `"Position #"` when `position` is `null`; live API errors display identically to `"Not configured"`; raw UTC timestamp string.
- **UI/UX:** Overwrites previous lookup with no session history; no provider selector checkboxes.
- **Functionality Gaps:** No `"Save to AI Visibility Prompts"` action.
- **PM Verdict:** **Keep & Secure** — add auth/usage checks immediately and bridge to AI Visibility prompts.

---

## Part 5: SEO Pillar — Local SEO

### 22. `/local-seo` (`app/(dashboard)/local-seo/page.tsx` + `components/local-seo/*`)
- **Pending / Bugs:** `"Change business"` has no `"Cancel"` button; manual lat/lng lacks range validation; `totals.views` in GBP performance is computed and never rendered; `attributes` mapped in `page.tsx` but never rendered.
- **UI/UX:** Long Country/State/City `<Select>`s lack search filtering; `"Menu views"` shown for non-restaurant businesses; hardcoded 30d window.
- **Functionality Gaps:** No GBP reviews list/replies, local citations, or performance trend chart.
- **PM Verdict:** **Keep** — solid Local SEO anchor.

### 23. `/local-seo/monitor` (`local-seo/monitor/page.tsx` + `components/local-seo/monitor-workspace.tsx`)
- **Pending / Bugs:** **`configDirty` ignores `gridSize`, `radiusKm`, and `autoTrackEnabled`** (runs scan with stale DB config); `active` starts `null` even when scans exist; `loadScan`/`getGuidance` ignore `!res.ok`; `GridMap` hardcodes `zoom={13}` and lacks `key={active.scan.id}` for reactive recentering.
- **UI/UX:** Copy promises *"see its trend over time"*, but no trend chart exists.
- **Functionality Gaps:** Single `trackedKeyword` limit; map popups don't show competing top-3 businesses.
- **PM Verdict:** **Keep & Fix** — strong differentiated feature; fix `configDirty`, auto-load latest scan, and add the trend chart.

### 24. `/local-seo/optimize` (`local-seo/optimize/page.tsx` + `components/local-seo/optimize-workspace.tsx`)
- **Pending / Bugs:** `toggleStatus` ignores `!res.ok`; no delete/dismiss/edit; `"Regenerate"` deduplicates only by exact title string, accumulating near-duplicate items forever.
- **UI/UX:** Very thin page (1 button + checklist).
- **Functionality Gaps:** No progress bar, priority tags, or links to action items.
- **PM Verdict:** **Consolidate** — merge into `Profile` or `Monitor` as a tab rather than a standalone sidebar route.

---

## Part 6: SEO Pillar — AI Visibility (11 Pages)

### 25. `/ai-visibility` (`app/(dashboard)/ai-visibility/page.tsx`)
- Pure redirect to `/ai-visibility/overview`.

### 26. `/ai-visibility/overview` (`overview/page.tsx`)
- **Pending / Bugs:** Shows `0%` next to `"No runs in the last 30 days yet"`; uses single latest day (`.at(-1)`) instead of window/run average; `byDaySov` includes deleted competitors; `isBrandedPrompt` ignores `aiVisibilityAliases`.
- **UI/UX:** No `EmptyState` or `AiVisibilityRunControls` on landing page.
- **PM Verdict:** **Consolidate** — merge into `/ai-visibility/visibility`.

### 27. `/ai-visibility/visibility` (`visibility/page.tsx` + `visibility-dashboard.tsx`)
- **Pending / Bugs:** `hasPrompts` ignores `enabled: false` (can burn usage running 0 enabled prompts); `PromptTrendChart` emits invalid CSS `--color-${domain}`; top summary banner ignores client filters (`days`, `model`, `tags`, `search`); `PromptCard` shows `0% Visibility` when `!hasData`; `RunControls` error text uses `absolute mt-12` (can overlap); `csv` outputs `undefined` cells.
- **UI/UX:** `<a href>` instead of `<Link>`; unconfigured alert lists raw `.env` names; renders up to 100 charts without pagination; silent 5-competitor cap.
- **Functionality Gaps:** Hardcoded `samplesPerProvider = 3`; synchronous run (no background progress/schedule); no per-prompt run button.
- **PM Verdict:** **Keep (Core)** — should be the main `/ai-visibility` landing view.

### 28. `/ai-visibility/visibility/[promptId]` (`visibility/[promptId]/page.tsx` + `prompt-detail.tsx`)
- **Pending / Bugs:** `MentionsTab` shows raw model IDs instead of pretty labels, and renders bare `%` on missing dates; same `--color-${domain}` CSS bug; competitor labels use `domain` instead of `name || domain`.
- **UI/UX:** Independent filters per tab; embeds full `QueryFanOutDashboard` and `CitationsDashboard` (with tag filters & broken Track domain); raw JSON `<pre>` dump for `rawOutput`.
- **Functionality Gaps:** No "Re-run this prompt" button, inline edit/pause, or prev/next navigation.
- **PM Verdict:** **Keep** — great drill-down; unify filters and lighten embedded tabs.

### 29. `/ai-visibility/share-of-voice` (`share-of-voice/page.tsx` + `share-of-voice-dashboard.tsx`)
- **Pending / Bugs:** Headline KPI (last day's LVCF %) disagrees with Leaderboard % (window total); **color collision** (`--chart-1` used for both brand and #1 competitor); filtered-empty state still renders entities with `0%`.
- **UI/UX:** Donut has no legend; no warning when 0 competitors exist.
- **Functionality Gaps:** No run controls, CSV export, or per-model/per-prompt SoV breakdown.
- **PM Verdict:** **Consolidate** — make a tab on `Visibility`.

### 30. `/ai-visibility/query-fan-out` (`query-fan-out/page.tsx` + `query-fan-out-dashboard.tsx`)
- **Pending / Bugs:** Pre-filtering `webQueries.length > 0` makes `"Prompt Runs w/ Unknown Queries"` always `0`; expand-all button is mislabeled `"View Details"` and cannot collapse.
- **UI/UX:** `WordCloud` isn't clickable; prompts don't link to `[promptId]`.
- **Functionality Gaps:** No `"Track as prompt"` action or CSV export.
- **PM Verdict:** **Keep or Tab under Citations/Visibility** — valuable for BrightData/OpenRouter users, empty for direct-API users.

### 31. `/ai-visibility/citations` (`citations/page.tsx` + `citations-dashboard.tsx`)
- **Pending / Bugs:** Headline share uses single last day (`.at(-1)`) while text claims `"of all citations"`; `allModels` hides models that returned 0 citations; `TrackDomainMenu` swallows errors; `days` defaults to `90` server-side vs `30` fallback client-side.
- **UI/UX:** Very tall single-scroll page; Content Gaps don't link to `[promptId]`.
- **Functionality Gaps:** No CSV export or `"Send to Outreach"` / `"Create post"` handoff.
- **PM Verdict:** **Keep (Core)** — break into top-level tabs for readability.

### 32. `/ai-visibility/opportunities` (`opportunities/page.tsx` + `opportunities-workspace.tsx`)
- **Pending / Bugs:** `handleGenerate` calls `res.json()` before `res.ok`; ignores `useSWR` error; `buildDigest` ignores `aiVisibilityAdditionalDomains`; `POST .../opportunities` lacks `checkAndIncrementUsage`.
- **UI/UX:** Generate button sits outside `EmptyState`; no staleness indicator when newer runs exist.
- **Functionality Gaps:** No dismiss/complete state, export, or handoff to Publish/Outreach.
- **PM Verdict:** **Keep** — strong strategic layer; add status tracking + Publish handoff.

### 33. `/ai-visibility/settings/prompts` (`settings/prompts/page.tsx`)
- **Pending / Bugs:** `handleBulkDelete` has no confirmation, loading state, or error handling; Select All selects across all pages; ignores `useSWR` error.
- **UI/UX:** Route is `/settings/prompts` but sits in main sidebar; no search or tag/status filter.
- **Functionality Gaps:** No inline `promptText` edit, bulk tag/enable, or AI prompt suggestions.
- **PM Verdict:** **Keep (as Tab/Drawer in Visibility or Settings)** — add search/filters and delete confirmation.

### 34. `/ai-visibility/settings/brand` (`settings/brand/page.tsx`)
- **Pending / Bugs:** Copy falsely claims context is used in Query Fan-Out; `ChipListField` Enter handler lacks `e.preventDefault()`; no `router.refresh()`.
- **UI/UX:** Disabled Name/Domain inputs with no link to Project Settings; no dirty indicator.
- **PM Verdict:** **Consolidate** — merge into one tabbed `/ai-visibility/settings` page and remove from global top bar.

### 35. `/ai-visibility/settings/providers` (`settings/providers/page.tsx`)
- **Pending / Bugs:** `handleSave` swallows errors with no `try/catch` or `!res.ok` check; no `router.refresh()`; `OpenRouterModelPicker` fetches 417 models even when disabled; cost calculator ignores selected OpenRouter model price.
- **UI/UX:** Confusing overlap with per-run overrides in `AiVisibilityRunControls`; mentions Integrations with no link.
- **PM Verdict:** **Consolidate** — merge into `/ai-visibility/settings` and remove from global top bar.

---

## Part 7: Publish & Social Pillars

### 36. `/publish` (`app/(dashboard)/publish/page.tsx` + `publish-composer.tsx`)
- **Pending / Bugs:** Doesn't warn/filter `status !== "connected"` sites; `saveTemplate()` uses `window.prompt()` with no edit/delete; `setScheduleTime` silently no-ops before picking a date; allows today + past time; no explicit `"Save draft"` button; `RichTextEditor` uses `window.prompt()` for links/images.
- **UI/UX:** `"Edit content/image per platform"` overpromises (only edits title & body); platform circles hide site names in tooltips; cover image has no preview/upload.
- **PM Verdict:** **Keep** — good 2-column composer; add explicit Save Draft and fix schedule/label polish.

### 37. `/publish/posts` (`publish/posts/page.tsx` + `publish-posts-list.tsx`)
- **Pending / Bugs:** Bulk delete/reschedule ignore `!res.ok`; `UpNext` mixes both `socialPosts` and `blogPosts` with no pillar badge; `PostCalendar` plots drafts/published on `createdAt`; no pagination or search.
- **UI/UX:** List/calendar open narrow 448px `PostsInspector` (`RichTextEditor` is cramped, no link to `/publish/posts/[postId]`), while `UpNext` links to `/publish/posts/[postId]`.
- **PM Verdict:** **Keep** — add search/pagination, fix `UpNext` pillar badges, and link `PostsInspector` to full review page.

### 38. `/publish/posts/[postId]` (`publish/posts/[postId]/page.tsx` + `publish-post-review.tsx`)
- **Pending / Bugs:** `handlePublish` patches all targets even if locked and ignores `!res.ok`; marks all targets `"queued"` even if already `published`/`failed`; `allSent` hides actions so `failed` targets can't be retried; no polling.
- **UI/UX:** Original `post.body` isn't shown for reference; no `"Respin all with AI"`.
- **PM Verdict:** **Keep** — essential review screen; add retry for failed targets and original body reference.

### 39. `/publish/connections` (`publish/connections/page.tsx`)
- **Pending / Bugs:** Delete has no confirmation and ignores errors; OAuth links wrap `<Button>` inside `<a>`; no `"Reconnect"` or `"Test"` button on errored rows; `OAuthStatusBanner` doesn't clear URL params.
- **PM Verdict:** **Keep** — clean setup page (shares structure with Social Connections).

### 40. `/social` (`app/(dashboard)/social/page.tsx` + `social-composer.tsx`)
- **Pending / Bugs:** Same template/schedule/draft/connection-status gaps as `/publish`; **`validationError` blocks `editPerPlatform` submission if text exceeds the tightest platform's character limit**, defeating the purpose of per-platform adaptation.
- **UI/UX:** `"Edit content/image per platform"` promises per-platform image editing that doesn't exist; single media URL input with no preview/upload/multi-image.
- **PM Verdict:** **Keep** — fix `editPerPlatform` validation bypass and add media preview.

### 41. `/social/posts` (`social/posts/page.tsx` + `social-posts-list.tsx`)
- **Pending / Bugs:** Same bulk error/pagination/`UpNext` mixing/`createdAt` calendar issues as `/publish/posts`; media-only posts show blank title.
- **UI/UX:** `PostsInspector` shows `SocialPostMetrics`, while `/social/posts/[postId]` does not.
- **PM Verdict:** **Keep** — unify with `SocialPostMetrics` on detail page and add search.

### 42. `/social/posts/[postId]` (`social/posts/[postId]/page.tsx` + `social-post-review.tsx`)
- **Pending / Bugs:** Same `handlePublish` / `allSent` retry blocker as `/publish/posts/[postId]`; original `post.body` and `post.mediaUrls` are neither shown nor editable.
- **UI/UX:** Very bare (`Status: ...` + target textareas); missing `SocialPostMetrics` for published posts.
- **PM Verdict:** **Keep & Enrich** — show original post/media, retry button, and metrics.

### 43. `/social/analytics` (`social/analytics/page.tsx` + `social-analytics-workspace.tsx`)
- **Pending / Bugs:** `useQuery` error ignored; 0 connected accounts shows 4 cards of `—` dashes instead of `EmptyState`; `new Date(p.date)` can shift 1 day in negative-UTC timezones.
- **UI/UX:** Hardcoded copy for FB/IG/LinkedIn; no manual refresh button.
- **Functionality Gaps:** No per-platform or top-posts breakdown; only 3 of 8 platforms supported (`ROADMAP.md`).
- **PM Verdict:** **Keep** — honest v1 foundation; add `EmptyState` for 0 accounts and per-platform breakdown.

### 44. `/social/connections` (`social/connections/page.tsx`)
- **Pending / Bugs:** Same delete confirmation/error/nested-`<a>`/`OAuthStatusBanner` issues as `/publish/connections`; Mastodon `instanceUrl` lacks URL validation; omits `accountIdentifier` on connected rows.
- **PM Verdict:** **Keep** — clean and functional.

---

## Part 8: Assistant, Top-Bar & Utility/Settings Pages

### 45. `/cappy` (`app/(dashboard)/cappy/page.tsx` + `components/cappy/*`)
- **Pending / Bugs:** **`handleSend` silently deletes user message on error with no error UI**; `ensureConversation()` is outside `try/catch`; **assistant replies render plain text (`whitespace-pre-wrap`), not Markdown**; sidebar thread list doesn't refresh titles/timestamps; no rename/delete thread UI.
- **UI/UX:** Fixed 1-row composer; no stop-streaming button; disabled providers don't link to `/integrations`.
- **PM Verdict:** **Keep (Core)** — strong chat UX; adding Markdown rendering and error/retry UI is top priority.

### 46. `/integrations` (`app/(dashboard)/integrations/page.tsx`)
- **Pending / Bugs:** `IntegrationConnectionCard` caches `status` in `useState` (stale on project switch); `PropertyPicker` disappears once saved (can't change GSC/GA4/Merchant property without disconnecting); **Google Business Profile card is dead UI** (`"Not used elsewhere in the app yet"`); missing `OAuthStatusBanner`.
- **UI/UX:** Mixes interactive OAuth, disabled `.env` cards (`PageSpeed`, `Bing`), keyless `IndexNow`, and read-only `Sites`/`Social` linkouts.
- **PM Verdict:** **Declutter** — remove dead GBP card, allow changing saved properties, and clarify global vs project connections.

### 47. `/ai-mcp` (`app/(dashboard)/ai-mcp/page.tsx`)
- **Pending / Bugs:** `McpKeyManager` ignores `!res.ok`, has no revoke confirmation; `CLAUDE_DESKTOP_CONFIG` hardcodes local monorepo `pnpm` + `localhost:5432` Postgres; `TOOL_GROUPS` is hardcoded rather than derived from `apps/mcp-server`.
- **PM Verdict:** **Self-Host / Dev Only** — gate or adapt for hosted HTTP MCP, and remove from default top bar for non-technical SaaS users.

### 48. `/spend` (`app/(dashboard)/spend/page.tsx`)
- **Pending / Bugs:** Queries global deployment-wide `providerSpendLog` with **no org/tenant scoping** — leaks instance-wide spend in hosted SaaS mode.
- **UI/UX:** Always occupies top-bar space (`$0.00`); capped at 50 rows with no range/provider filter.
- **PM Verdict:** **Gate to `isSelfHosted()`** — essential for self-hosters paying their own API keys; should not be shown to hosted SaaS tenants.

### 49. `/settings` (`app/(dashboard)/settings/page.tsx`)
- **Pending / Bugs:** Read-only placeholders (`"no edit-profile flow yet"`, `"no invite-teammates flow yet"`); unused `Settings` import; `SignOutButton` has no loading/error state; no link to `/settings/billing`.
- **PM Verdict:** **Incomplete** — add profile/workspace editing and tabbed navigation to `/settings/billing` (in SaaS mode).

### 50. `/settings/billing` (`app/(dashboard)/settings/billing/page.tsx`)
- **Pending / Bugs:** `BANK_APPROVAL_PENDING` treated as `"active"`; `BillingActions` stuck on `"Redirecting…"` if Cashfree modal is closed; `cancelSubscription` has no confirmation dialog.
- **UI/UX:** No inline plan feature list or link back to `/settings`.
- **PM Verdict:** **Keep** (hosted SaaS only) — add cancel confirmation and modal-close recovery.

### 51. `/help` (`app/(dashboard)/help/page.tsx`)
- **Pending / Bugs:** Hardcodes `http://localhost:3001` (`pnpm --filter @rosterseo/docs dev`); Community card is a `"Coming soon"` placeholder; internal dev copy (`"what's real vs. mock today"`).
- **PM Verdict:** **Fix Copy & Docs URL** — point docs link to `/docs` (already proxied in `next.config.mjs`) and remove placeholder community card.
