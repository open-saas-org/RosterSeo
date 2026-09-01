import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, doublePrecision, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth-schema";

// An organization is the tenant boundary. In SELF_HOSTED mode a deploy
// typically has exactly one organization; in hosted mode there are many.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // owner | member
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  targetLocation: text("target_location"),
  // Which Search Console / GA4 property this project syncs, picked from the
  // organization's single shared Google connection (see google_connections
  // below) - property SELECTION is per-project, the OAuth connection itself
  // is per-organization, not per-project.
  gscPropertyId: text("gsc_property_id"),
  ga4PropertyId: text("ga4_property_id"),
  // Which Merchant Center account this project reports on (resource name,
  // e.g. "accounts/123456"), picked from the org's connected Google
  // account's real accounts.list result - same per-project-pick-from-a-
  // shared-connection shape as gsc/ga4 above.
  merchantAccountId: text("merchant_account_id"),
  // Free-text brand context fed into AI Visibility's sampling/fan-out/
  // opportunity prompts (Settings > Brand) - not used anywhere else.
  aiVisibilityContext: text("ai_visibility_context"),
  // Alternate/sub-brand names an LLM's answer might use instead of the
  // project name (e.g. an abbreviation or a product line name) - fed into
  // parseResponseForEntity's mention matching alongside `name`, so a
  // response naming the sub-brand instead of the project name still
  // counts as a real mention. Null/empty = match on `name` only.
  aiVisibilityAliases: jsonb("ai_visibility_aliases").$type<string[]>(),
  // Other domains this brand owns (blog, regional ccTLD, docs subdomain) -
  // citations from these count as the brand's own instead of falling into
  // "other"/uncategorized in classifyUrl. Null/empty = `domain` only.
  aiVisibilityAdditionalDomains: jsonb("ai_visibility_additional_domains").$type<string[]>(),
  // Which of the globally env-configured AI Visibility providers/models this
  // project actually samples from - null/empty means "fall back to
  // defaultTargets()" (@rosterseo/ai-visibility - BrightData + OpenRouter by
  // default). A settings-level toggle list, not a separate table - provider
  // credentials themselves stay global env vars (this is a self-hosted,
  // single-operator tool; see the removed credit-metering system for the
  // same reasoning).
  aiVisibilityTargets: jsonb("ai_visibility_targets").$type<
    Array<{ model: string; provider: string; version?: string; webSearch: boolean; enabled: boolean }>
  >(),
  // Which Bing Webmaster Tools site this project reports on, picked from
  // the workspace's single global API key's GetUserSites list.
  bingSiteUrl: text("bing_site_url"),
  // Self-generated IndexNow protocol key (lazily created on first submit) -
  // no OAuth/account needed, just a random key hosted at a known URL.
  indexnowKey: text("indexnow_key"),
  // Which provider/model Cappy (the in-app AI assistant, see cappyConversations
  // below) uses for this project - "openai" | "anthropic" | "openrouter",
  // the only 3 real tool-calling-capable providers (see
  // packages/ai-visibility/src/providers/agentic.ts). Null falls back to
  // "openrouter" in apps/web/lib/cappy/agent-loop.ts. Same
  // per-project-setting-over-global-credentials shape as aiVisibilityTargets
  // above - credentials stay global env vars, this just picks which one.
  cappyProvider: text("cappy_provider"),
  cappyModel: text("cappy_model"),
  // Soft-delete: set instead of a real DELETE when the user picks "delete
  // but keep the data" from Project Settings, so the project (and every
  // cascading child row) can be restored later. Every query that lists
  // "my projects" (switcher, GET /api/projects, getCurrentProject's
  // fallback) filters this out; the row and all its real data stay intact
  // in the DB either way.
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectCompetitors = pgTable("project_competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  // Real display name for the competitor - required when adding one from
  // the AI Visibility Competitors page (Brand + domain, so digests/reports
  // can name a rival instead of just its domain); left null for rows added
  // via the plain SEO Competitor Research flow, which only ever asks for a
  // domain.
  name: text("name"),
  // Same alias/additional-domain concept as projects.aiVisibilityAliases/
  // aiVisibilityAdditionalDomains above, but for a tracked competitor - one
  // rival entity can have a sub-brand name and own more than one domain
  // (regional site, product-line site). Null/empty = match on `domain` /
  // `name` only, same as before this column existed.
  aliases: jsonb("aliases").$type<string[]>(),
  additionalDomains: jsonb("additional_domains").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trackedKeywords = pgTable("tracked_keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  // Legacy per-keyword free-text location - kept for backward compat on old
  // rows, but new keywords no longer set it. Location is now one project-
  // wide setting (see rank_tracking_settings below), matching how a real
  // rank tracker's config (not each keyword) carries location/device.
  location: text("location"),
  // Cached from a real getKeywordMetrics() (@rosterseo/dataforseo) Labs call
  // at Fetch-Rankings time - null until the first real fetch runs. Caching
  // here is what stops the page from calling DataForSEO live on every
  // render (the bug the rank tracking rebuild fixed).
  searchVolume: integer("search_volume"),
  keywordDifficulty: integer("keyword_difficulty"),
  cpc: doublePrecision("cpc"),
  metricsFetchedAt: timestamp("metrics_fetched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per project: where/how this project's rank checks run. Separate
// from `projects.targetLocation` (a free-text onboarding field used
// elsewhere) since this needs a real DataForSEO location_code, not free
// text. `scheduleInterval` is stored for UI parity with the "Weekly"
// option but "weekly" is inert - no recurring job reads it yet.
export const rankTrackingSettings = pgTable("rank_tracking_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  locationCode: integer("location_code").notNull(),
  locationName: text("location_name").notNull(),
  device: text("device").notNull().default("desktop"), // desktop | mobile
  scheduleInterval: text("schedule_interval").notNull().default("manual"), // manual | weekly (weekly not yet automatic)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// One row per bulk "Fetch Rankings" execution (background rankCheckJob) -
// real run history, not just a mutable "last checked" timestamp, so the
// position-distribution chart can group real snapshots by real check runs.
export const rankCheckRuns = pgTable("rank_check_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  keywordsTotal: integer("keywords_total").notNull(),
  keywordsChecked: integer("keywords_checked").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// --- Keyword Research (PRD 5.2) ---
// A real search-history log, not just a transient in-memory result set -
// lets a user revisit what they searched before without re-typing. Doesn't
// snapshot the actual result set returned (see keywordMetricsCache below
// for that), just the search itself.
export const keywordResearchSearches = pgTable("keyword_research_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  seedKeyword: text("seed_keyword").notNull(),
  locationCode: integer("location_code").notNull(),
  locationName: text("location_name").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// The real persistence behind "once fetched it needs to save that data" -
// every keyword returned by a real search (not just tracked ones) is
// upserted here, keyed by (project, keyword, location). A repeat search
// for an already-cached, still-fresh (<7 days, matching Rank Tracking's
// METRICS_STALE_MS convention) keyword skips the DataForSEO call entirely.
export const keywordMetricsCache = pgTable(
  "keyword_metrics_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    searchVolume: integer("search_volume").notNull().default(0),
    keywordDifficulty: integer("keyword_difficulty").notNull().default(0),
    cpc: doublePrecision("cpc").notNull().default(0),
    intent: text("intent"), // e.g. "commercial", "informational", "transactional", "navigational"
    monthlySearches: jsonb("monthly_searches").$type<number[]>(), // last 12 months, oldest -> newest
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.keyword, table.locationCode)],
);

// --- Backlinks (PRD 5.4) ---
// Same caching + history shape as keywordMetricsCache/keywordResearchSearches
// above - a repeat lookup for an already-cached, still-fresh (<7 days,
// matching Rank Tracking's METRICS_STALE_MS convention) domain skips the
// DataForSEO call entirely, and past lookups stay revisitable instead of
// vanishing the moment the page unmounts.
export const backlinksCache = pgTable(
  "backlinks_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    totalBacklinks: integer("total_backlinks").notNull().default(0),
    referringDomains: integer("referring_domains").notNull().default(0),
    domainRating: integer("domain_rating").notNull().default(0),
    // Up to ~200 real individual backlink rows (domainFrom/urlFrom/anchor/
    // dofollow/spamScore/etc, see @rosterseo/dataforseo's BacklinkItem) from
    // the same lookup that filled the aggregate columns above - powers the
    // Backlinks page's real per-row list + quality filters, and is where
    // "Add to Outreach" picks a row from. Cached alongside the aggregate
    // rather than in a separate table so one lookup/one fetchedAt covers
    // both - there's no case where a caller wants one without the other.
    topBacklinks: jsonb("top_backlinks").$type<
      Array<{
        domainFrom: string;
        urlFrom: string;
        urlTo: string;
        anchor: string | null;
        dofollow: boolean;
        domainFromRank: number;
        spamScore: number;
        firstSeen: string | null;
        lastSeen: string | null;
        isNew: boolean;
        isLost: boolean;
      }>
    >(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.domain)],
);

// --- Competitor Research ---
// Same fetch-or-cache pattern as backlinksCache/keywordMetricsCache above -
// the Competitors page used to call DataForSEO live (domain overview +
// backlinks overview + ranked keywords, ~4 real requests) for every tracked
// competitor on every single page visit, with nothing persisted at all.
// Keyed by (project, domain, location) like keywordMetricsCache, since a
// domain's traffic estimate is location-specific.
export const competitorSnapshotCache = pgTable(
  "competitor_snapshot_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    locationCode: integer("location_code").notNull(),
    estimatedMonthlyTraffic: integer("estimated_monthly_traffic").notNull().default(0),
    organicKeywords: integer("organic_keywords").notNull().default(0),
    topPages: jsonb("top_pages").$type<Array<{ url: string; traffic: number }>>(),
    totalBacklinks: integer("total_backlinks").notNull().default(0),
    referringDomains: integer("referring_domains").notNull().default(0),
    domainRating: integer("domain_rating").notNull().default(0),
    // Real ranked_keywords from DataForSEO Labs - the competitor's actual
    // organic keywords, not a gap analysis against the user's own site.
    keywordIdeas: jsonb("keyword_ideas").$type<
      Array<{
        keyword: string;
        searchVolume: number;
        difficulty: number;
        cpc: number;
        competition: number | null;
        trend: number[];
        intent: string | null;
      }>
    >(),
    // Snapshot of this same row's values from BEFORE the most recent
    // refresh (captured in fetchCompetitorSnapshot at upsert time, not
    // computed here) - what powers a real "vs last check" delta on the
    // Competitors page instead of a fabricated trend arrow. Null until this
    // domain has been refreshed at least twice; never backfilled/estimated.
    previousEstimatedMonthlyTraffic: integer("previous_estimated_monthly_traffic"),
    previousOrganicKeywords: integer("previous_organic_keywords"),
    previousTotalBacklinks: integer("previous_total_backlinks"),
    previousReferringDomains: integer("previous_referring_domains"),
    previousDomainRating: integer("previous_domain_rating"),
    previousFetchedAt: timestamp("previous_fetched_at"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.domain, table.locationCode)],
);

// --- Page Analyzer (PRD 5.1) ---
export const pageAnalyzerReports = pgTable("page_analyzer_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  targetKeyword: text("target_keyword").notNull(),
  targetLocation: text("target_location"),
  status: text("status").notNull().default("pending"), // pending | running | complete | failed
  result: jsonb("result"), // crawled on-page data + SERP/competitor diff + AI fix-it plan, once complete
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Keyword rank tracking (PRD 5.2) ---
// tracked_keywords already holds the "what to track"; this holds the
// historical position snapshots that make the ranking-trend chart real.
export const keywordRankings = pgTable("keyword_rankings", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackedKeywordId: uuid("tracked_keyword_id")
    .notNull()
    .references(() => trackedKeywords.id, { onDelete: "cascade" }),
  position: integer("position"), // null = not ranking in top N at check time
  url: text("url"),
  // Null = a one-off single-keyword "check now" (not part of a bulk Fetch
  // Rankings run) - deliberately excluded from the position-distribution
  // chart's aggregation so a single re-check doesn't skew the portfolio
  // trend. onDelete "set null" (not cascade) so history survives even if a
  // run row is ever pruned.
  runId: uuid("run_id").references(() => rankCheckRuns.id, { onDelete: "set null" }),
  device: text("device"), // desktop | mobile
  serpFeatures: jsonb("serp_features").$type<string[]>(),
  // True when DataForSEO was unconfigured or the real SERP call failed and
  // checkKeywordRanking() (@rosterseo/dataforseo) fell back to deterministic
  // demo data for this row - real, load-bearing signal, not decoration.
  // Without it a fabricated position is indistinguishable from a real one
  // anywhere this row is read (trend chart, position-distribution chart,
  // MCP's get_rankings tool), which defeats the entire point of a rank
  // tracker. Every writer of this table must set it explicitly.
  isMock: boolean("is_mock").notNull().default(false),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

// --- Site Audit / Crawler (PRD 5.4) ---
export const siteAudits = pgTable("site_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | running | analyzing | complete | failed
  pagesCrawled: integer("pages_crawled").notNull().default(0),
  pagesDiscovered: integer("pages_discovered").notNull().default(0),
  maxPages: integer("max_pages").notNull().default(200),
  healthScore: integer("health_score"), // 0-100, set on completion
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  // Whether the crawl's BFS frontier fully drained (vs. stopping early on
  // maxPages/deadline/cancel) and whether the link graph stayed under
  // MAX_LINK_ROWS_PER_AUDIT - both persisted here (not just kept in the
  // worker's in-memory closure) so the deep check, which can run long after
  // the crawl finished as its own separate job, knows whether orphan
  // detection is trustworthy without re-crawling.
  crawlCompleted: boolean("crawl_completed").notNull().default(false),
  linkGraphComplete: boolean("link_graph_complete").notNull().default(false),
  // Broken links / orphaned pages / keyword cannibalization run as a
  // separate, on-demand pass over this audit's already-crawled data (not
  // part of the crawl itself - see site-audit-deep-check-runner.ts), so
  // they get their own status/lifecycle instead of overloading `status`.
  deepCheckStatus: text("deep_check_status"), // null | pending | running | complete | failed
  deepCheckStartedAt: timestamp("deep_check_started_at"),
  deepCheckCompletedAt: timestamp("deep_check_completed_at"),
});

export const siteAuditIssues = pgTable("site_audit_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => siteAudits.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(), // critical | warning | info
  category: text("category").notNull(), // e.g. "meta", "links", "performance", "indexability"
  url: text("url").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const siteAuditPages = pgTable("site_audit_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => siteAudits.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  statusCode: integer("status_code").notNull().default(200),
  title: text("title"),
  h1Count: integer("h1_count").notNull().default(0),
  wordCount: integer("word_count").notNull().default(0),
  imageCount: integer("image_count").notNull().default(0),
  loadTimeMs: integer("load_time_ms"),
  redirectedTo: text("redirected_to"),
  // Real technical-audit columns (Screaming-Frog-style), captured at zero
  // extra HTTP cost since the crawl already fetched/parsed this page -
  // canonicalUrl/metaRobots were already being extracted by fetchAndParse
  // and just discarded before this; crawlDepth is new (real BFS link-
  // distance from the seed, see crawler.ts's depthByUrl).
  canonicalUrl: text("canonical_url"),
  metaRobots: text("meta_robots"),
  crawlDepth: integer("crawl_depth").notNull().default(0),
  h2Texts: jsonb("h2_texts").$type<string[]>(),
  // Manual per-page triage, set by the user working through issues after a
  // crawl - not written by the crawler itself. "no_action" is the default
  // every page starts at, not a real choice the user made.
  action: text("action").notNull().default("no_action"), // no_action | in_progress | fixed
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per outbound link found during the crawl (internal AND
// external) - captured at zero extra HTTP cost (every internal target
// already gets fetched anyway) and reused for three checks: internal
// broken links (join to site_audit_pages), external broken links (a
// separately-budgeted check against the distinct external target_urls
// here), and orphaned pages (anti-join - a page nothing else targets).
// No projectId column, same as site_audit_pages/site_audit_issues -
// scoped via a join through site_audits in RLS.
export const siteAuditLinks = pgTable("site_audit_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => siteAudits.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url").notNull(),
  isExternal: boolean("is_external").notNull().default(false),
});

export const siteAuditsRelations = relations(siteAudits, ({ many }) => ({
  siteAuditIssues: many(siteAuditIssues),
  siteAuditPages: many(siteAuditPages),
  siteAuditLinks: many(siteAuditLinks),
}));

export const siteAuditIssuesRelations = relations(siteAuditIssues, ({ one }) => ({
  audit: one(siteAudits, {
    fields: [siteAuditIssues.auditId],
    references: [siteAudits.id],
  }),
}));

export const siteAuditPagesRelations = relations(siteAuditPages, ({ one }) => ({
  audit: one(siteAudits, {
    fields: [siteAuditPages.auditId],
    references: [siteAudits.id],
  }),
}));

export const siteAuditLinksRelations = relations(siteAuditLinks, ({ one }) => ({
  audit: one(siteAudits, {
    fields: [siteAuditLinks.auditId],
    references: [siteAudits.id],
  }),
}));

// --- AI-Search / LLM Brand Visibility (PRD 5.7) ---
export const aiVisibilityPrompts = pgTable("ai_visibility_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  promptText: text("prompt_text").notNull(),
  // Free-form user labels for organizing prompts (e.g. "tools", "education") -
  // purely a client-side filtering/organizing aid, no effect on sampling.
  tags: jsonb("tags").$type<string[]>(),
  // A disabled prompt is skipped by POST .../run (still shown here, still
  // deletable) - lets a user pause tracking a prompt without losing its
  // history, distinct from deleting it outright.
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiVisibilityResults = pgTable("ai_visibility_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => aiVisibilityPrompts.id, { onDelete: "cascade" }),
  // Groups every row inserted by one POST .../run call (brand + every
  // tracked competitor, every provider, every sample) so Share of Voice can
  // query "the latest real run" precisely instead of guessing from timestamps.
  runId: uuid("run_id").notNull(),
  // null = this row is about the project's own brand; a domain = this row
  // is about that tracked competitor, parsed from the exact same real LLM
  // response as the brand row for this (prompt, provider, sample) - no
  // extra API cost for Share of Voice over brand-only sampling.
  entityDomain: text("entity_domain"),
  provider: text("provider").notNull(), // openai | anthropic | google | perplexity | brightdata | openrouter
  // The AI surface reached, when it differs from `provider` - only
  // meaningful for a provider that fans out to several surfaces (BrightData:
  // chatgpt | gemini | perplexity | copilot | google-ai-overview). Null for
  // the 4 original direct-API providers, where surface === provider.
  model: text("model"),
  mentioned: boolean("mentioned").notNull(),
  position: integer("position"), // rough position within the answer, if mentioned
  sentiment: text("sentiment"), // positive | neutral | negative
  responseSnippet: text("response_snippet"),
  // Real web-search queries the provider issued while producing this
  // answer (BrightData/OpenRouter :online runs) - null when not applicable,
  // or a single ["unavailable"] sentinel when a search demonstrably
  // happened (citations exist) but the provider didn't expose the query
  // strings. Powers the real Query Fan-Out analysis.
  webQueries: jsonb("web_queries").$type<string[]>(),
  // Real cited sources. Historically a plain string[] of URLs (only ever
  // populated for Perplexity) - widened to structured objects so every
  // provider's citations carry a title/domain/order. Old plain-string rows
  // are normalized defensively at read time, not backfilled.
  citations: jsonb("citations").$type<Array<{ url: string; title?: string; domain: string; citationIndex: number }>>(),
  // The full raw provider payload this row was parsed from (whatever shape
  // that provider's registry entry returns - a chat completion, a scraped
  // BrightData snapshot, etc). Only the derived fields above used to
  // survive past parsing, so a future improvement to mention/sentiment/
  // citation parsing could never be re-applied to history - this makes
  // that reprocessable without re-paying providers. Best-effort: null for
  // any row where capturing it failed or predates this column.
  rawOutput: jsonb("raw_output"),
  runAt: timestamp("run_at").notNull().defaultNow(),
});

// One cached, categorized LLM-generated "what to do next" report per
// generation (Opportunities page, Phase E) - a deterministic digest of real
// citation/mention data fed into a single structured LLM completion.
// Append-only history: the latest row per project is what the page
// renders, older rows are just kept as a simple audit trail rather than
// deleted.
export const aiVisibilityOpportunityReports = pgTable("ai_visibility_opportunity_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  // The full enriched report - relatedPrompts already resolved to real
  // prompt IDs (for deep-linking) and citations already split into
  // yourCitations/competitorCitations per opportunity, not the raw LLM
  // output (see packages/ai-visibility/src/visibility-opportunity.ts).
  report: jsonb("report")
    .notNull()
    .$type<{
      summary: string[];
      risks: string[];
      opportunities: Array<{
        category: "creation" | "existing-content" | "outreach" | "social";
        title: string;
        why: string;
        promptRefs: Array<{ promptId: string | null; promptText: string }>;
        yourCitations: Array<{ url: string; title?: string; domain: string; count: number }>;
        competitorCitations: Array<{ url: string; title?: string; domain: string; count: number }>;
      }>;
    }>(),
  provider: text("provider"), // which provider generated this report
  model: text("model"), // the resolved model id (e.g. "google/gemini-2.5-flash" via openrouter)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Local SEO (PRD 5.5) ---
// One row per project: the real business identity (pulled from DataForSEO's
// Business Data API, not Google Business Profile OAuth - see
// packages/dataforseo's getBusinessListingDetails) plus the Monitor
// (geo-grid) tracking config. Config lives on this row rather than a
// separate settings table because it's 1:1 with "the business" - there's
// nothing to track without one.
export const localBusinessProfiles = pgTable("local_business_profiles", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  placeId: text("place_id"),
  cid: text("cid"),
  // The exact search query + DataForSEO location_code used to find this
  // business - replayed on re-sync so we re-fetch the SAME listing instead
  // of guessing again. Null for a manually-entered lat/lng (no DataForSEO
  // listing to look up), which also means resync is unavailable for it.
  searchQuery: text("search_query"),
  locationCode: integer("location_code"),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  domain: text("domain"),
  category: text("category"),
  additionalCategories: jsonb("additional_categories").$type<string[]>(),
  description: text("description"),
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),
  totalPhotos: integer("total_photos"),
  isClaimed: boolean("is_claimed"),
  // Google's own nested shapes, stored as-is and rendered defensively -
  // not worth fully modeling for a read-only display card.
  workTime: jsonb("work_time"),
  attributes: jsonb("attributes"),
  // Null = never enriched (e.g. a manual-only save, or the enrichment call
  // failed and we saved the base fields anyway rather than blocking).
  lastSyncedAt: timestamp("last_synced_at"),
  // Monitor (geo-grid rank tracking) config. Null trackedKeyword = tracking
  // not configured yet - Monitor shows a setup prompt instead of a map.
  trackedKeyword: text("tracked_keyword"),
  gridSize: integer("grid_size").notNull().default(5),
  radiusKm: doublePrecision("radius_km").notNull().default(5),
  autoTrackEnabled: boolean("auto_track_enabled").notNull().default(true),
  // Optional real Google Business Profile OAuth link, for Performance
  // insights (calls/bookings/direction requests/etc) only - private,
  // owner-only data that doesn't exist anywhere outside GBP's own API, so
  // there's no DataForSEO equivalent for it the way there is for the
  // listing fields above. Null until the user connects a real account
  // (Integrations page) and picks a location here; the connection itself
  // still needs Google's separate manual Performance API approval before
  // any of these three columns being set actually returns real numbers.
  gbpAccountId: text("gbp_account_id"),
  gbpLocationId: text("gbp_location_id"),
  gbpLocationName: text("gbp_location_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Optimize: an LLM-generated local SEO strategy, generated on-demand and
// persisted so it's a checklist the user works through over time rather
// than something regenerated (and re-shuffled) on every page visit.
export const localSeoRecommendations = pgTable("local_seo_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // listing | content | reviews | technical
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("todo"), // todo | done
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// One real WordPress site connected per project, via a WP core 5.6+
// Application Password (Users > Profile in the customer's own WP admin) -
// no plugin, no OAuth. `applicationPassword` is stored as plain text, same
// convention google_connections.access_token/refresh_token already use, so
// this doesn't introduce a new encryption layer inconsistently.
export const wordpressConnections = pgTable("wordpress_connections", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  siteUrl: text("site_url").notNull(),
  username: text("username").notNull(),
  applicationPassword: text("application_password").notNull(),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
});

// --- Backlink Outreach ---
// One connected sender identity per row - a project can have several
// (matches "connect one or multiple emails per project"). Deliberately its
// own project-scoped table, not a 5th google_connections service: that
// table is organization-scoped (one Google account serves every project,
// right for GSC/GA/GBP/Merchant's "verify a property once" model), but
// outreach identity is naturally per-project (an agency wants project A's
// outreach coming from a different address than project B's).
// smtpPasswordEncrypted is stored as plain text, same convention
// google_connections.access_token/wordpress_connections.application_password
// already use (see that table's own comment) - not introducing a new
// encryption layer inconsistently for just this one credential.
export const emailConnections = pgTable("email_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "smtp" | "gmail_oauth"
  label: text("label").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  // SMTP-only fields - null for a gmail_oauth connection.
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUsername: text("smtp_username"),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),
  // Gmail OAuth-only fields - null for an smtp connection. Same real
  // access/refresh-token shape as google_connections, but this table isn't
  // that one (see the comment above) so it needs its own copy.
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailExpiresAt: timestamp("gmail_expires_at"),
  gmailNeedsReconnect: boolean("gmail_needs_reconnect").notNull().default(false),
  // Real send-pacing safeguard, not cosmetic - a fresh or low-volume sender
  // sending too many cold outreach emails at once is what actually gets
  // flagged as spam. The outreach send job enforces this per connection
  // per day; see apps/worker/src/features/outreach-runner.ts.
  dailySendLimit: integer("daily_send_limit").notNull().default(30),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per backlink-outreach target, optionally traced back to the real
// backlink row it came from (sourceUrlFrom, a backlinksCache.topBacklinks
// entry's urlFrom) - "optionally" because a target can also be added
// directly by domain, without an existing backlink.
export const outreachTargets = pgTable("outreach_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  sourceUrlFrom: text("source_url_from"),
  contactEmail: text("contact_email"),
  // Where contactEmail came from - a real crawled page URL (see
  // packages/crawler's findContactEmail), or "manual" for a typed-in
  // address. Null until one of those actually happens.
  contactEmailSource: text("contact_email_source"),
  subject: text("subject"),
  body: text("body"),
  // new (just added, no draft yet) -> drafted (AI/edited draft ready) ->
  // queued (send job accepted it, pacing may delay actual send) -> sent |
  // failed.
  status: text("status").notNull().default("new"),
  emailConnectionId: uuid("email_connection_id").references(() => emailConnections.id, { onDelete: "set null" }),
  failureReason: text("failure_reason"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Cappy (in-app AI agent assistant) ---
// One thread of conversation, always scoped to exactly one project AND the
// user who started it - an org member's Cappy chats are never shown to
// another org member by default (RLS below still only enforces the org
// tenant boundary like every other table; the user_id scoping is an
// application-layer filter applied in every query in apps/web/lib/cappy/*,
// same pattern mcp_api_keys already uses for its own explicit user_id
// filtering - see that table's own comment for why).
export const cappyConversations = pgTable("cappy_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"), // derived from the first user message; null until then
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
});

// One row per real conversational turn (a user message, or one assistant
// turn - which may carry visible text, tool calls, or both). Tool RESULTS
// are embedded back into the same assistant row's toolCalls[] entry
// (result/status), not a separate "tool" role row - keeps a flat
// one-row-per-turn list that's trivial to render as a transcript.
export const cappyMessages = pgTable("cappy_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => cappyConversations.id, { onDelete: "cascade" }),
  // Denormalized from conversationId rather than joined through it - every
  // project-scoped table in this project carries its own project_id for
  // RLS (packages/db/README.md), not a join-through-parent policy.
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content"), // visible text; null for a pure tool-call turn
  // CappyToolCall[] | null (see the exported type below). This is the only
  // column ever UPDATEd after insert (when a pending_confirmation call is
  // approved/denied) - every other column on every row is append-only.
  toolCalls: jsonb("tool_calls").$type<CappyToolCall[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per project: Cappy's LLM-maintained standing summary, refreshed
// either automatically (every N new messages, see
// apps/web/lib/cappy/project-notes.ts) or immediately via the agent's own
// update_project_notes tool call. Plain Postgres, no embeddings/vector
// search - kept short enough to paste into every system prompt whole (see
// this plan's Context note on why pgvector was rejected).
export const cappyProjectNotes = pgTable("cappy_project_notes", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  summary: text("summary").notNull().default(""),
  messageCountAtLastRefresh: integer("message_count_at_last_refresh").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CappyToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind: "read" | "write";
  status: "auto_executed" | "pending_confirmation" | "approved" | "denied" | "error";
  result?: unknown;
  error?: string;
};

export const cappyConversationsRelations = relations(cappyConversations, ({ many }) => ({
  messages: many(cappyMessages),
}));
export const cappyMessagesRelations = relations(cappyMessages, ({ one }) => ({
  conversation: one(cappyConversations, { fields: [cappyMessages.conversationId], references: [cappyConversations.id] }),
}));

// Geo-grid rank tracking: one row per real scan (a keyword checked across a
// grid of real lat/lng points around a center, via DataForSEO's
// location_coordinate param - see packages/dataforseo). Points live in
// local_grid_scan_points below, one row per grid cell.
export const localGridScans = pgTable("local_grid_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  centerLat: doublePrecision("center_lat").notNull(),
  centerLng: doublePrecision("center_lng").notNull(),
  radiusKm: doublePrecision("radius_km").notNull(),
  gridSize: integer("grid_size").notNull(), // 3 | 5 | 7 (NxN)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const localGridScanPoints = pgTable("local_grid_scan_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id")
    .notNull()
    .references(() => localGridScans.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // null = the project's business wasn't found within the checked depth at
  // this point, not "not checked yet" (every point in a scan is checked).
  position: integer("position"),
  businessName: text("business_name"),
});

export const localGridScansRelations = relations(localGridScans, ({ many }) => ({
  points: many(localGridScanPoints),
}));

export const localGridScanPointsRelations = relations(localGridScanPoints, ({ one }) => ({
  scan: one(localGridScans, {
    fields: [localGridScanPoints.scanId],
    references: [localGridScans.id],
  }),
}));

// --- Google integrations: GSC + GA4 (PRD 5.6) ---
// One row per (organization, service) - a Google OAuth grant belongs to a
// Google ACCOUNT, not a project, so it's authenticated once per
// organization and shared by every project underneath it. Which property
// each project actually uses is a separate, per-project choice - see
// projects.gscPropertyId / ga4PropertyId above.
export const googleConnections = pgTable(
  "google_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    service: text("service").notNull(), // gsc | ga4
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    // Set true only when a real refresh attempt got Google's invalid_grant
    // back (the refresh token itself was revoked/expired) - see
    // apps/web/lib/google-token.ts. NOT derived from expiresAt: an expired
    // access token is expected and refreshed transparently before every
    // real use, not a reason to force the user back through OAuth consent.
    needsReconnect: boolean("needs_reconnect").notNull().default(false),
    connectedAt: timestamp("connected_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.organizationId, table.service)],
);

// --- MCP API keys ---
// Personal access tokens for the standalone MCP server (apps/mcp-server) -
// the one thing in this app that talks to an AI agent over stdio/HTTP
// instead of a browser session, so it has no cookie to authenticate with.
// Scoped by user (not project) - the same key can read/act on every
// project the user's orgs give them access to, mirroring how
// getCurrentProject()/withUserContext already work for the browser app.
// Only the hash is ever stored; the real key is shown exactly once at
// creation time, same convention as every other "copy this secret now"
// flow (WordPress application passwords, IndexNow keys).
export const mcpApiKeys = pgTable("mcp_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Default"),
  keyHash: text("key_hash").notNull().unique(),
  // First few real characters of the key, kept in the clear so the UI can
  // show "sk-...ab12" for identification without ever storing the secret
  // itself in reversible form.
  keyPrefix: text("key_prefix").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

// --- AI Visibility report sharing ---
// A real, revocable public link for the AI Visibility report
// (/reports/ai-visibility/[projectId]) - deliberately NOT RLS-protected,
// the same documented exception as mcp_api_keys above: this row's own
// token IS the access credential, not something org-membership RLS should
// gate. The report page looks up a matching row by token with no session
// at all, then runs the actual report queries via
// withUserContext(createdByUserId, ...) - a real member of that project's
// org (whoever generated the link), so RLS still correctly authorizes
// exactly that one project's real data and nothing else; the anonymous
// visitor never gets any capability beyond what this one read-only report
// already renders. One row per project (unique) - generating a new link
// replaces (revokes) any previous one rather than accumulating unlimited
// live links.
export const aiVisibilityReportShares = pgTable("ai_visibility_report_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Provider spend tracking ---
// Real (or clearly-flagged-estimated) per-call cost for every external API
// this app pays for - DataForSEO, BrightData, and the AI Visibility LLM
// providers. Deliberately instance-wide, not project- or org-scoped: every
// one of these credentials is a single global env var (see 0012's "the
// credit-metering system was removed; provider credentials are global env
// vars instead"), so there's no real per-org spend to attribute even in
// hosted mode - this is "what is the operator of this deployment paying
// the upstream APIs," the same question a self-hosted single operator asks.
// Same deliberate RLS exception as mcp_api_keys, for the same structural
// reason: there's no project_id/organization_id to scope by. The Spend
// page's route gates on withAuth (a real signed-in session) instead - a
// real limitation in multi-tenant hosted mode (any signed-in user on the
// instance can see the whole instance's spend), acceptable for now since
// hosted multi-tenant billing isn't otherwise implemented in this schema.
export const providerSpendLog = pgTable("provider_spend_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // dataforseo | brightdata | openai | anthropic | google | perplexity | openrouter
  provider: text("provider").notNull(),
  // Free-form label of what kind of call this was - a DataForSEO endpoint
  // path (e.g. "/keywords_data/google_ads/search_volume/live") or an LLM
  // call kind ("sample" | "structured_research").
  operation: text("operation").notNull(),
  model: text("model"), // LLM model id - null for dataforseo/brightdata, which aren't model-addressed
  costUsd: doublePrecision("cost_usd").notNull(),
  // false only for DataForSEO (real `cost` field in its own API response)
  // and OpenRouter (real `usage.cost` when requested) - every other
  // provider's cost here is computed from real token usage x a
  // hand-maintained public pricing table, or (BrightData, which has no
  // token concept) a flat per-call estimate - same honesty convention as
  // this app's existing PROVIDER_COST_ESTIMATES_USD, never presented as a
  // real invoice.
  isEstimate: boolean("is_estimate").notNull().default(false),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Publish (multi-platform blog publishing) ---
// One connected blog platform account per row - a project can have several
// (more than one WordPress site, or WordPress + Ghost + Dev.to at once).
// Deliberately NOT the same table as wordpress_connections above (that's a
// separate, pre-existing one-per-project Integrations-page card, unrelated
// to this feature - left untouched). `credentials` is a jsonb blob rather
// than per-type columns like email_connections' smtp*/gmail* split: with 9+
// platforms (app password, API key, OAuth token, GraphQL PAT...) wide
// columns per type would be unwieldy - same reasoning as
// local_business_profiles.attributes storing "Google's own nested shapes,
// not worth fully modeling". Stored as plain text, same convention every
// other credential in this app already uses (google_connections,
// wordpress_connections, email_connections all document this same choice).
export const blogConnections = pgTable("blog_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // wordpress | wordpress_com | ghost | tumblr | devto | hashnode | webflow | shopify | hubspot | blogger
  label: text("label").notNull(),
  authType: text("auth_type").notNull(), // app_password | api_key | oauth
  credentials: jsonb("credentials").notNull().$type<Record<string, string>>(),
  siteIdentifier: text("site_identifier").notNull(), // site URL / blog ID / publication ID - whatever that platform needs to target the right blog
  status: text("status").notNull().default("connected"), // connected | needs_reconnect | error
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
});

// The canonical/master post - one row per "thing the user wrote," fanned
// out to one or more blogPostTargets below. Body is Markdown (no rich-text
// editor dependency exists in this repo today, and Dev.to/Hashnode want
// Markdown natively anyway - HTML-only platforms get it converted at send
// time by packages/publishing's markdown helper).
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  excerpt: text("excerpt"),
  coverImageUrl: text("cover_image_url"),
  tags: jsonb("tags").notNull().default([]).$type<string[]>(),
  // draft -> scheduled (scheduledFor set, targets queued with a future
  // startAfter) -> publishing -> published | partial (some targets failed) | failed (all failed).
  status: text("status").notNull().default("draft"),
  scheduledFor: timestamp("scheduled_for"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// One row per platform a post targets - same per-recipient status-machine
// shape as outreachTargets, just per-platform instead of per-contact.
// adaptedTitle/adaptedBody hold the AI-respun (or manually edited) variant
// for this platform; both default to the parent post's title/body until
// respun, so every target always has real content to send even if the
// user never clicks "respin." projectId is denormalized (not just reachable
// via blogPostId -> blogPosts.projectId) so its RLS policy can check it
// directly instead of joining through the parent - same choice
// cappy_messages made for the same reason.
export const blogPostTargets = pgTable("blog_post_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  blogPostId: uuid("blog_post_id")
    .notNull()
    .references(() => blogPosts.id, { onDelete: "cascade" }),
  blogConnectionId: uuid("blog_connection_id")
    .notNull()
    .references(() => blogConnections.id, { onDelete: "cascade" }),
  adaptedTitle: text("adapted_title").notNull(),
  adaptedBody: text("adapted_body").notNull(),
  status: text("status").notNull().default("pending"), // pending | queued | publishing | published | failed
  remotePostId: text("remote_post_id"),
  remoteUrl: text("remote_url"),
  failureReason: text("failure_reason"),
  publishedAt: timestamp("published_at"),
});

export const blogPostsRelations = relations(blogPosts, ({ many }) => ({
  targets: many(blogPostTargets),
}));

export const blogPostTargetsRelations = relations(blogPostTargets, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostTargets.blogPostId], references: [blogPosts.id] }),
  connection: one(blogConnections, { fields: [blogPostTargets.blogConnectionId], references: [blogConnections.id] }),
}));

// --- Social (multi-platform social publishing) ---
// Exact same three-table shape as blog_connections/blog_posts/
// blog_post_targets above, generalized to social platforms instead of
// blogs - see those tables' own comments for the reasoning (jsonb
// credentials over per-type columns, projectId denormalized onto targets
// for a direct RLS policy instead of a join-through-parent one).
export const socialConnections = pgTable("social_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // bluesky | mastodon | linkedin | pinterest | facebook_page | instagram | threads | tiktok | x
  label: text("label").notNull(),
  authType: text("auth_type").notNull(), // app_password | oauth
  credentials: jsonb("credentials").notNull().$type<Record<string, string>>(),
  accountIdentifier: text("account_identifier").notNull(), // handle / instance URL / page ID / user ID - whatever that platform needs to target the right account
  status: text("status").notNull().default("connected"), // connected | needs_reconnect | error
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
});

// Canonical post - short-form plain text (not Markdown, unlike blog_posts;
// social platforms don't render Markdown). mediaUrls holds real uploaded
// image URLs (Pinterest/Instagram require at least one image; others
// treat it as optional).
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  mediaUrls: jsonb("media_urls").notNull().default([]).$type<string[]>(),
  status: text("status").notNull().default("draft"), // draft -> scheduled -> publishing -> published | partial | failed
  scheduledFor: timestamp("scheduled_for"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const socialPostTargets = pgTable("social_post_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  socialPostId: uuid("social_post_id")
    .notNull()
    .references(() => socialPosts.id, { onDelete: "cascade" }),
  socialConnectionId: uuid("social_connection_id")
    .notNull()
    .references(() => socialConnections.id, { onDelete: "cascade" }),
  adaptedBody: text("adapted_body").notNull(), // AI-respun (or manually edited) text, char-limit-aware per platform
  status: text("status").notNull().default("pending"), // pending | queued | publishing | published | failed
  remotePostId: text("remote_post_id"),
  remoteUrl: text("remote_url"),
  failureReason: text("failure_reason"),
  publishedAt: timestamp("published_at"),
});

export const socialPostsRelations = relations(socialPosts, ({ many }) => ({
  targets: many(socialPostTargets),
}));

export const socialPostTargetsRelations = relations(socialPostTargets, ({ one }) => ({
  post: one(socialPosts, { fields: [socialPostTargets.socialPostId], references: [socialPosts.id] }),
  connection: one(socialConnections, { fields: [socialPostTargets.socialConnectionId], references: [socialConnections.id] }),
}));

// A saved platform combination ("Marketing team" -> LinkedIn + X + Bluesky,
// say) so composing doesn't mean re-picking the same set of connections
// every time - the composer's "Save selection" writes here, and its
// preselected-platform dropdown reads from here. connectionIds references
// social_connections.id but isn't a real FK array (Postgres has no native
// FK-on-jsonb-array) - a connection deleted after being saved into a
// template just drops out silently when the composer resolves the ids
// against the current connections list, same non-issue as any other
// jsonb-of-ids column in this schema.
export const socialPlatformTemplates = pgTable("social_platform_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  connectionIds: jsonb("connection_ids").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Same shape, blog_connections instead of social_connections - see
// social_platform_templates above for the reasoning.
export const blogPlatformTemplates = pgTable("blog_platform_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  connectionIds: jsonb("connection_ids").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per Mastodon instance this deployment has ever connected to -
// Mastodon's OAuth requires a real per-instance "app" (POST
// {instance}/api/v1/apps), unlike every other platform here which uses one
// operator-registered app for all users. Registering is free/instant and
// idempotent-in-spirit, so this table just caches the result per instance
// instead of re-registering (and accumulating throwaway apps) on every
// connect attempt.
export const mastodonApps = pgTable("mastodon_apps", {
  instanceUrl: text("instance_url").primaryKey(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
