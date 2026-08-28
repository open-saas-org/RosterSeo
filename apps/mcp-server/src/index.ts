import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import crypto from "node:crypto";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import {
  db,
  withUserContext,
  mcpApiKeys,
  projects,
  trackedKeywords,
  keywordRankings,
  siteAudits,
  siteAuditIssues,
  siteAuditPages,
  projectCompetitors,
  aiVisibilityPrompts,
  aiVisibilityResults,
  aiVisibilityOpportunityReports,
  pageAnalyzerReports,
  keywordResearchSearches,
  keywordMetricsCache,
  localBusinessProfiles,
  localGridScans,
  localGridScanPoints,
  insertSpendLog,
} from "@seo-tool/db";
import {
  getKeywordIdeas,
  getRelatedKeywords,
  getKeywordSuggestions,
  getRealKeywordMetrics,
  getSerpResults,
  getBacklinksOverview,
  getDomainOverview,
  setDataForSeoSpendLogger,
} from "@seo-tool/dataforseo";
import { generateIndexNowKey, submitUrlsToIndexNow } from "@seo-tool/indexnow";

// Same DB-agnostic spend-logger wiring as apps/web/lib/spend-logging.ts -
// this server's own real DataForSEO calls (research_keywords, get_keyword_metrics,
// get_serp_results, get_backlinks_overview, get_domain_overview tools) get
// logged into provider_spend_log the same as every other real caller.
setDataForSeoSpendLogger((event) => {
  insertSpendLog({ provider: "dataforseo", operation: event.operation, costUsd: event.costUsd, isEstimate: false });
});
import { getBingRankAndTrafficStats } from "@seo-tool/bing";

// ============================================================================
// Auth: every tool call is scoped to exactly one real user, resolved once
// from SEO_TOOL_API_KEY (generated on the app's AI & MCP settings page -
// hashed there, hashed here, compared, never stored/transmitted in the
// clear except at generation time). From there every DB read/write runs
// inside withUserContext(userId, ...), the same RLS-backed helper every
// Route Handler in apps/web uses - a key can only ever see/act on projects
// belonging to organizations that user is actually a member of.
// ============================================================================

const rawApiKey = process.env.SEO_TOOL_API_KEY;
if (!rawApiKey) {
  console.error(
    "[seo-tool-mcp] SEO_TOOL_API_KEY is not set. Generate one from the app's AI & MCP page and set it in your MCP client config.",
  );
  process.exit(1);
}
const apiKeyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");

// A stdio MCP server is one long-lived process per client connection (e.g.
// a whole Claude Desktop session) - caching the resolved user FOREVER after
// the first call meant revoking a key from the web UI never actually
// stopped an already-running session, contradicting both the revoke
// route's own comment and this server's README. Re-checking on literally
// every call would be needlessly chatty for a fast local Postgres, so this
// caches for a short TTL instead - revocation takes effect within seconds,
// not "never until the process restarts."
const AUTH_CACHE_TTL_MS = 30_000;
let cachedUserId: string | null = null;
let cachedAt = 0;

async function resolveUserId(): Promise<string> {
  if (cachedUserId && Date.now() - cachedAt < AUTH_CACHE_TTL_MS) return cachedUserId;

  const [row] = await db
    .select({ id: mcpApiKeys.id, userId: mcpApiKeys.userId, revokedAt: mcpApiKeys.revokedAt })
    .from(mcpApiKeys)
    .where(eq(mcpApiKeys.keyHash, apiKeyHash))
    .limit(1);
  if (!row || row.revokedAt) {
    cachedUserId = null;
    throw new Error("Invalid or revoked SEO_TOOL_API_KEY - generate a new one from the app's AI & MCP page.");
  }
  cachedUserId = row.userId;
  cachedAt = Date.now();
  // Fire-and-forget - a failed "last used" bump shouldn't fail the real
  // tool call that triggered it.
  db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.id)).catch(() => {});
  return row.userId;
}

// Every DB-backed tool goes through this instead of the bare `db` export -
// resolves the caller once, then runs inside the real RLS-scoped
// transaction, exactly like apps/web/lib/api-utils.ts's withAuth/
// requireProjectAccess do for browser-session requests.
async function asCaller<T>(fn: Parameters<typeof withUserContext<T>>[1]): Promise<T> {
  const userId = await resolveUserId();
  return withUserContext(userId, fn);
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function arg(args: unknown, key: string): unknown {
  return (args as Record<string, unknown> | undefined)?.[key];
}
function strArg(args: unknown, key: string): string {
  const v = arg(args, key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`'${key}' is required and must be a non-empty string.`);
  return v.trim();
}
function optStrArg(args: unknown, key: string): string | undefined {
  const v = arg(args, key);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function optNumArg(args: unknown, key: string, fallback: number): number {
  const v = arg(args, key);
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ============================================================================
// Tool definitions
// ============================================================================

const projectIdProp = { projectId: { type: "string", description: "The project UUID (see list_projects)" } };

const TOOLS: Tool[] = [
  { name: "list_projects", description: "List every SEO project the caller's API key can access.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_project_details", description: "Full details for one project (domain, target location, connected properties).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp }, required: ["projectId"] } },

  { name: "get_keywords", description: "Tracked keywords for a project (Rank Tracking).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp }, required: ["projectId"] } },
  { name: "add_tracked_keyword", description: "Start tracking a new keyword for a project.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, keyword: { type: "string" } }, required: ["projectId", "keyword"] } },
  { name: "get_rankings", description: "Real position-check history for a project's tracked keywords, most recent first.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, keyword: { type: "string", description: "Filter to one tracked keyword's exact text (optional)" }, limit: { type: "number", description: "Max rows (default 100)" } }, required: ["projectId"] } },

  { name: "get_site_audits", description: "Site audit run history for a project (status, health score, pages crawled).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, limit: { type: "number", description: "Max audits (default 10)" } }, required: ["projectId"] } },
  { name: "get_site_audit_detail", description: "One site audit's full issue list and crawled pages.", inputSchema: { type: "object", additionalProperties: false, properties: { auditId: { type: "string" } }, required: ["auditId"] } },

  { name: "get_competitors", description: "Tracked competitor domains for a project.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp }, required: ["projectId"] } },
  { name: "add_competitor", description: "Start tracking a competitor domain for a project.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, domain: { type: "string" }, name: { type: "string", description: "Display name (optional)" } }, required: ["projectId", "domain"] } },

  { name: "get_brand_visibility", description: "AI-answer-engine brand visibility: tracked prompts, real sample results, and visibility percent for a project's own brand (competitor mentions excluded from the percent).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, limit: { type: "number", description: "Max result rows per prompt (default 200 total)" } }, required: ["projectId"] } },
  { name: "get_ai_visibility_opportunities", description: "The latest AI-visibility content/outreach opportunity report for a project.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp }, required: ["projectId"] } },
  { name: "track_ai_visibility_prompt", description: "Start tracking a new prompt for AI-visibility sampling.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, promptText: { type: "string" } }, required: ["projectId", "promptText"] } },

  { name: "get_page_analyzer_reports", description: "Past Page Analyzer report runs for a project (url, target keyword, status, date).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, limit: { type: "number", description: "Max reports (default 20)" } }, required: ["projectId"] } },
  { name: "get_page_analyzer_report", description: "One Page Analyzer report's full stored result (crawl data, SERP comparison, fix-it findings, AI guidance).", inputSchema: { type: "object", additionalProperties: false, properties: { reportId: { type: "string" } }, required: ["reportId"] } },

  { name: "get_keyword_research_history", description: "Past keyword research searches for a project, plus their cached real metrics.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, limit: { type: "number", description: "Max searches (default 20)" } }, required: ["projectId"] } },
  { name: "research_keywords", description: "Real, live DataForSEO keyword research for a seed term: ideas, related terms, and suggestions with search volume/difficulty/CPC. Not persisted to any project.", inputSchema: { type: "object", additionalProperties: false, properties: { seedKeyword: { type: "string" }, locationCode: { type: "number", description: "DataForSEO location code (default 2840 = United States)" }, limit: { type: "number", description: "Max results per category (default 20)" } }, required: ["seedKeyword"] } },
  { name: "get_keyword_metrics", description: "Real search volume, difficulty, CPC, and intent for one exact keyword.", inputSchema: { type: "object", additionalProperties: false, properties: { keyword: { type: "string" }, locationCode: { type: "number", description: "DataForSEO location code (default 2840 = United States)" } }, required: ["keyword"] } },
  { name: "get_serp_results", description: "Real live top-10 Google SERP for a keyword.", inputSchema: { type: "object", additionalProperties: false, properties: { keyword: { type: "string" }, location: { type: "string", description: "Location name (default \"United States\")" } }, required: ["keyword"] } },

  { name: "get_backlinks_overview", description: "Real backlink profile summary for a domain (total backlinks, referring domains, rank).", inputSchema: { type: "object", additionalProperties: false, properties: { domain: { type: "string" } }, required: ["domain"] } },
  { name: "get_domain_overview", description: "Real organic-traffic domain overview (estimated traffic, ranked keywords count, domain rank).", inputSchema: { type: "object", additionalProperties: false, properties: { domain: { type: "string" }, locationCode: { type: "number", description: "DataForSEO location_code (default 2840 = United States)" } }, required: ["domain"] } },

  { name: "get_local_business_profile", description: "A project's Local SEO business profile (name, address, coordinates).", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp }, required: ["projectId"] } },
  { name: "get_local_grid_scans", description: "Local SEO grid-scan history for a project, with per-point ranking results.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, limit: { type: "number", description: "Max scans (default 10)" } }, required: ["projectId"] } },

  { name: "get_bing_performance", description: "Real Bing Webmaster Tools clicks/impressions/position for a project's connected site.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, startDate: { type: "string", description: "YYYY-MM-DD (default 28 days ago)" }, endDate: { type: "string", description: "YYYY-MM-DD (default today)" } }, required: ["projectId"] } },

  { name: "submit_urls_to_indexnow", description: "Notify Bing/Yandex/Seznam/Naver via IndexNow that a project's URLs changed, so they get re-crawled sooner. All URLs must share one host.", inputSchema: { type: "object", additionalProperties: false, properties: { ...projectIdProp, urls: { type: "array", items: { type: "string" }, description: "Real absolute URLs, all on the same host" } }, required: ["projectId", "urls"] } },
];

const server = new Server({ name: "seo-tool-mcp", version: "0.2.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_projects": {
        const rows = await asCaller((tx) =>
          tx.select({ id: projects.id, name: projects.name, domain: projects.domain, targetLocation: projects.targetLocation }).from(projects),
        );
        return ok(rows);
      }

      case "get_project_details": {
        const projectId = strArg(args, "projectId");
        const [row] = await asCaller((tx) => tx.select().from(projects).where(eq(projects.id, projectId)).limit(1));
        return ok(row ?? null);
      }

      case "get_keywords": {
        const projectId = strArg(args, "projectId");
        const rows = await asCaller((tx) => tx.select().from(trackedKeywords).where(eq(trackedKeywords.projectId, projectId)));
        return ok(rows);
      }

      case "add_tracked_keyword": {
        const projectId = strArg(args, "projectId");
        const keyword = strArg(args, "keyword");
        const [row] = await asCaller((tx) => tx.insert(trackedKeywords).values({ projectId, keyword }).returning());
        return ok(row);
      }

      case "get_rankings": {
        const projectId = strArg(args, "projectId");
        const keywordFilter = optStrArg(args, "keyword");
        const limit = optNumArg(args, "limit", 100);

        const keywords = await asCaller((tx) =>
          tx.select({ id: trackedKeywords.id, keyword: trackedKeywords.keyword }).from(trackedKeywords).where(eq(trackedKeywords.projectId, projectId)),
        );
        const matched = keywordFilter ? keywords.filter((k) => k.keyword.toLowerCase() === keywordFilter.toLowerCase()) : keywords;
        const kwIds = matched.map((k) => k.id);

        const rows = kwIds.length
          ? await asCaller((tx) =>
              tx
                .select({ trackedKeywordId: keywordRankings.trackedKeywordId, position: keywordRankings.position, url: keywordRankings.url, checkedAt: keywordRankings.checkedAt })
                .from(keywordRankings)
                .where(inArray(keywordRankings.trackedKeywordId, kwIds))
                .orderBy(desc(keywordRankings.checkedAt))
                .limit(limit),
            )
          : [];
        return ok({ keywords: matched, rankings: rows });
      }

      case "get_site_audits": {
        const projectId = strArg(args, "projectId");
        const limit = optNumArg(args, "limit", 10);
        const rows = await asCaller((tx) =>
          tx.select().from(siteAudits).where(eq(siteAudits.projectId, projectId)).orderBy(desc(siteAudits.startedAt)).limit(limit),
        );
        return ok(rows);
      }

      case "get_site_audit_detail": {
        const auditId = strArg(args, "auditId");
        const [audit] = await asCaller((tx) => tx.select().from(siteAudits).where(eq(siteAudits.id, auditId)).limit(1));
        if (!audit) return ok({ audit: null, issues: [], pages: [] });
        const [issues, pages] = await asCaller((tx) =>
          Promise.all([
            tx.select().from(siteAuditIssues).where(eq(siteAuditIssues.auditId, auditId)),
            tx.select().from(siteAuditPages).where(eq(siteAuditPages.auditId, auditId)),
          ]),
        );
        return ok({ audit, issues, pages });
      }

      case "get_competitors": {
        const projectId = strArg(args, "projectId");
        const rows = await asCaller((tx) => tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, projectId)));
        return ok(rows);
      }

      case "add_competitor": {
        const projectId = strArg(args, "projectId");
        const domain = strArg(args, "domain");
        const displayName = optStrArg(args, "name");
        const [row] = await asCaller((tx) => tx.insert(projectCompetitors).values({ projectId, domain, name: displayName ?? null }).returning());
        return ok(row);
      }

      case "get_brand_visibility": {
        const projectId = strArg(args, "projectId");
        const limit = optNumArg(args, "limit", 200);

        const prompts = await asCaller((tx) => tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, projectId)));
        const promptIds = prompts.map((p) => p.id);

        const results = promptIds.length
          ? await asCaller((tx) =>
              tx
                .select()
                .from(aiVisibilityResults)
                .where(and(inArray(aiVisibilityResults.promptId, promptIds), isNull(aiVisibilityResults.entityDomain)))
                .orderBy(desc(aiVisibilityResults.runAt))
                .limit(limit),
            )
          : [];

        const mentioned = results.filter((r) => r.mentioned).length;
        const visibilityPercent = results.length ? Math.round((mentioned / results.length) * 100) : null;

        return ok({ visibilityPercent, promptCount: prompts.length, prompts, results });
      }

      case "get_ai_visibility_opportunities": {
        const projectId = strArg(args, "projectId");
        const [row] = await asCaller((tx) =>
          tx.select().from(aiVisibilityOpportunityReports).where(eq(aiVisibilityOpportunityReports.projectId, projectId)).orderBy(desc(aiVisibilityOpportunityReports.createdAt)).limit(1),
        );
        return ok(row ?? null);
      }

      case "track_ai_visibility_prompt": {
        const projectId = strArg(args, "projectId");
        const promptText = strArg(args, "promptText");
        const [row] = await asCaller((tx) => tx.insert(aiVisibilityPrompts).values({ projectId, promptText }).returning());
        return ok(row);
      }

      case "get_page_analyzer_reports": {
        const projectId = strArg(args, "projectId");
        const limit = optNumArg(args, "limit", 20);
        const rows = await asCaller((tx) =>
          tx
            .select({ id: pageAnalyzerReports.id, url: pageAnalyzerReports.url, targetKeyword: pageAnalyzerReports.targetKeyword, status: pageAnalyzerReports.status, createdAt: pageAnalyzerReports.createdAt })
            .from(pageAnalyzerReports)
            .where(eq(pageAnalyzerReports.projectId, projectId))
            .orderBy(desc(pageAnalyzerReports.createdAt))
            .limit(limit),
        );
        return ok(rows);
      }

      case "get_page_analyzer_report": {
        const reportId = strArg(args, "reportId");
        const [row] = await asCaller((tx) => tx.select().from(pageAnalyzerReports).where(eq(pageAnalyzerReports.id, reportId)).limit(1));
        return ok(row ?? null);
      }

      case "get_keyword_research_history": {
        const projectId = strArg(args, "projectId");
        const limit = optNumArg(args, "limit", 20);
        const [searches, cached] = await asCaller((tx) =>
          Promise.all([
            tx.select().from(keywordResearchSearches).where(eq(keywordResearchSearches.projectId, projectId)).orderBy(desc(keywordResearchSearches.createdAt)).limit(limit),
            tx.select().from(keywordMetricsCache).where(eq(keywordMetricsCache.projectId, projectId)).orderBy(desc(keywordMetricsCache.fetchedAt)).limit(200),
          ]),
        );
        return ok({ searches, cachedMetrics: cached });
      }

      case "research_keywords": {
        const seedKeyword = strArg(args, "seedKeyword");
        const locationCode = optNumArg(args, "locationCode", 2840);
        const limit = optNumArg(args, "limit", 20);
        // Auth-gated (a valid API key is required to reach this handler at
        // all) but not project-scoped - real, live DataForSEO calls,
        // mirroring how the app's own Keyword Research page works.
        await resolveUserId();
        const [ideas, related, suggestions] = await Promise.all([
          getKeywordIdeas(seedKeyword, locationCode, limit),
          getRelatedKeywords(seedKeyword, locationCode, limit),
          getKeywordSuggestions(seedKeyword, locationCode, limit),
        ]);
        return ok({ ideas, related, suggestions });
      }

      case "get_keyword_metrics": {
        const keyword = strArg(args, "keyword");
        const locationCode = arg(args, "locationCode");
        await resolveUserId();
        const metrics = await getRealKeywordMetrics(keyword, typeof locationCode === "number" ? locationCode : undefined);
        return ok(metrics);
      }

      case "get_serp_results": {
        const keyword = strArg(args, "keyword");
        const location = optStrArg(args, "location") ?? "United States";
        await resolveUserId();
        const results = await getSerpResults(keyword, location);
        return ok(results);
      }

      case "get_backlinks_overview": {
        const domain = strArg(args, "domain");
        await resolveUserId();
        const overview = await getBacklinksOverview(domain);
        return ok(overview);
      }

      case "get_domain_overview": {
        const domain = strArg(args, "domain");
        const locationCode = arg(args, "locationCode");
        await resolveUserId();
        const overview = await getDomainOverview(domain, typeof locationCode === "number" ? locationCode : undefined);
        return ok(overview);
      }

      case "get_local_business_profile": {
        const projectId = strArg(args, "projectId");
        const [row] = await asCaller((tx) => tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1));
        return ok(row ?? null);
      }

      case "get_local_grid_scans": {
        const projectId = strArg(args, "projectId");
        const limit = optNumArg(args, "limit", 10);
        const scans = await asCaller((tx) =>
          tx.select().from(localGridScans).where(eq(localGridScans.projectId, projectId)).orderBy(desc(localGridScans.createdAt)).limit(limit),
        );
        const scanIds = scans.map((s) => s.id);
        const points = scanIds.length ? await asCaller((tx) => tx.select().from(localGridScanPoints).where(inArray(localGridScanPoints.scanId, scanIds))) : [];
        return ok(scans.map((scan) => ({ ...scan, points: points.filter((p) => p.scanId === scan.id) })));
      }

      case "get_bing_performance": {
        const projectId = strArg(args, "projectId");
        const [project] = await asCaller((tx) => tx.select({ bingSiteUrl: projects.bingSiteUrl }).from(projects).where(eq(projects.id, projectId)).limit(1));
        if (!project?.bingSiteUrl) return ok({ error: "This project has no Bing Webmaster Tools site connected." });

        const end = optStrArg(args, "endDate") ?? new Date().toISOString().slice(0, 10);
        const startDefault = new Date();
        startDefault.setDate(startDefault.getDate() - 28);
        const start = optStrArg(args, "startDate") ?? startDefault.toISOString().slice(0, 10);

        const rows = await getBingRankAndTrafficStats(project.bingSiteUrl, start, end);
        return ok(rows);
      }

      case "submit_urls_to_indexnow": {
        const projectId = strArg(args, "projectId");
        const rawUrls = arg(args, "urls");
        const urls = Array.isArray(rawUrls) ? rawUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0) : [];
        if (urls.length === 0) throw new Error("'urls' must be a non-empty array of strings.");

        let hosts: string[];
        try {
          hosts = urls.map((u) => new URL(u).host);
        } catch {
          throw new Error("'urls' must contain absolute URLs.");
        }
        const host = hosts[0]!;
        if (hosts.some((h) => h !== host)) {
          throw new Error("All urls must share the same host for one IndexNow submission.");
        }

        const [project] = await asCaller((tx) => tx.select({ indexnowKey: projects.indexnowKey }).from(projects).where(eq(projects.id, projectId)).limit(1));
        if (!project) throw new Error("Project not found.");

        let key = project.indexnowKey;
        if (!key) {
          key = generateIndexNowKey();
          await asCaller((tx) => tx.update(projects).set({ indexnowKey: key }).where(eq(projects.id, projectId)));
        }

        // This app's own /api/indexnow/[key] route hosts the key file. The
        // browser-facing app derives this from the live request's own
        // origin (req.nextUrl.origin) - this server has no inbound HTTP
        // request to read an origin from, so it needs APP_URL set
        // explicitly. Falling back to the TARGET site's own host here
        // (https://${host}) was a real bug: it built a keyLocation IndexNow
        // could never actually verify, since that route only exists on
        // this app, not the customer's domain - fail loudly instead.
        const appUrl = process.env.APP_URL?.trim();
        if (!appUrl) {
          throw new Error(
            "APP_URL is not set - this server can't build a keyLocation IndexNow can verify without knowing its own public URL. Set APP_URL in your environment (e.g. https://your-seo-tool-domain.com).",
          );
        }
        const keyLocation = new URL(`/api/indexnow/${key}`, appUrl).toString();

        await submitUrlsToIndexNow(host, key, keyLocation, urls);
        return ok({ submitted: urls.length, keyLocation });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
