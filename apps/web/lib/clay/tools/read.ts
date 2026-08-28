import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
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
  outreachTargets,
  blogConnections,
  socialConnections,
  withUserContext,
} from "@seo-tool/db";
import { getKeywordIdeas, getRelatedKeywords, getKeywordSuggestions, getRealKeywordMetrics, getSerpResults, getBacklinksOverview, getDomainOverview } from "@seo-tool/dataforseo";
import { getBingRankAndTrafficStats } from "@seo-tool/bing";
import type { ClayToolContext } from "./registry";

// Real query logic mirroring apps/mcp-server/src/index.ts's 24-tool
// catalog - same real tables, same real DataForSEO/Bing calls, just
// running with a userId already resolved from a real browser session
// (ctx.userId) instead of an MCP API key. Duplicated rather than shared in
// v1 to avoid a cross-package refactor of the MCP server's inline switch
// statement - a documented fast-follow, not blocking (see the Clay plan).

export async function readProjectDetails(ctx: ClayToolContext) {
  const [row] = await withUserContext(ctx.userId, (tx) => tx.select().from(projects).where(eq(projects.id, ctx.projectId)).limit(1));
  return row ?? null;
}

export async function readTrackedKeywords(ctx: ClayToolContext) {
  return withUserContext(ctx.userId, (tx) => tx.select().from(trackedKeywords).where(eq(trackedKeywords.projectId, ctx.projectId)));
}

export async function readKeywordRankings(ctx: ClayToolContext, args: { keyword?: string; limit?: number }) {
  const limit = args.limit ?? 100;
  const keywords = await withUserContext(ctx.userId, (tx) =>
    tx.select({ id: trackedKeywords.id, keyword: trackedKeywords.keyword }).from(trackedKeywords).where(eq(trackedKeywords.projectId, ctx.projectId)),
  );
  const matched = args.keyword ? keywords.filter((k) => k.keyword.toLowerCase() === args.keyword!.toLowerCase()) : keywords;
  const kwIds = matched.map((k) => k.id);
  const rows = kwIds.length
    ? await withUserContext(ctx.userId, (tx) =>
        tx
          .select({ trackedKeywordId: keywordRankings.trackedKeywordId, position: keywordRankings.position, url: keywordRankings.url, checkedAt: keywordRankings.checkedAt })
          .from(keywordRankings)
          .where(inArray(keywordRankings.trackedKeywordId, kwIds))
          .orderBy(desc(keywordRankings.checkedAt))
          .limit(limit),
      )
    : [];
  return { keywords: matched, rankings: rows };
}

export async function readSiteAudits(ctx: ClayToolContext, args: { limit?: number }) {
  const limit = args.limit ?? 10;
  return withUserContext(ctx.userId, (tx) =>
    tx.select().from(siteAudits).where(eq(siteAudits.projectId, ctx.projectId)).orderBy(desc(siteAudits.startedAt)).limit(limit),
  );
}

export async function readSiteAuditDetail(ctx: ClayToolContext, args: { auditId: string }) {
  const [audit] = await withUserContext(ctx.userId, (tx) => tx.select().from(siteAudits).where(and(eq(siteAudits.id, args.auditId), eq(siteAudits.projectId, ctx.projectId))).limit(1));
  if (!audit) return { audit: null, issues: [], pages: [] };
  const [issues, pages] = await withUserContext(ctx.userId, (tx) =>
    Promise.all([
      tx.select().from(siteAuditIssues).where(eq(siteAuditIssues.auditId, args.auditId)),
      tx.select().from(siteAuditPages).where(eq(siteAuditPages.auditId, args.auditId)),
    ]),
  );
  return { audit, issues, pages };
}

export async function readCompetitors(ctx: ClayToolContext) {
  return withUserContext(ctx.userId, (tx) => tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, ctx.projectId)));
}

export async function readBrandVisibility(ctx: ClayToolContext, args: { limit?: number }) {
  const limit = args.limit ?? 200;
  const prompts = await withUserContext(ctx.userId, (tx) => tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, ctx.projectId)));
  const promptIds = prompts.map((p) => p.id);
  const results = promptIds.length
    ? await withUserContext(ctx.userId, (tx) =>
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
  return { visibilityPercent, promptCount: prompts.length, prompts, results };
}

export async function readAiVisibilityOpportunities(ctx: ClayToolContext) {
  const [row] = await withUserContext(ctx.userId, (tx) =>
    tx.select().from(aiVisibilityOpportunityReports).where(eq(aiVisibilityOpportunityReports.projectId, ctx.projectId)).orderBy(desc(aiVisibilityOpportunityReports.createdAt)).limit(1),
  );
  return row ?? null;
}

export async function readPageAnalyzerReports(ctx: ClayToolContext, args: { limit?: number }) {
  const limit = args.limit ?? 20;
  return withUserContext(ctx.userId, (tx) =>
    tx
      .select({ id: pageAnalyzerReports.id, url: pageAnalyzerReports.url, targetKeyword: pageAnalyzerReports.targetKeyword, status: pageAnalyzerReports.status, createdAt: pageAnalyzerReports.createdAt })
      .from(pageAnalyzerReports)
      .where(eq(pageAnalyzerReports.projectId, ctx.projectId))
      .orderBy(desc(pageAnalyzerReports.createdAt))
      .limit(limit),
  );
}

export async function readPageAnalyzerReport(ctx: ClayToolContext, args: { reportId: string }) {
  const [row] = await withUserContext(ctx.userId, (tx) =>
    tx.select().from(pageAnalyzerReports).where(and(eq(pageAnalyzerReports.id, args.reportId), eq(pageAnalyzerReports.projectId, ctx.projectId))).limit(1),
  );
  return row ?? null;
}

export async function readKeywordResearchHistory(ctx: ClayToolContext, args: { limit?: number }) {
  const limit = args.limit ?? 20;
  const [searches, cached] = await withUserContext(ctx.userId, (tx) =>
    Promise.all([
      tx.select().from(keywordResearchSearches).where(eq(keywordResearchSearches.projectId, ctx.projectId)).orderBy(desc(keywordResearchSearches.createdAt)).limit(limit),
      tx.select().from(keywordMetricsCache).where(eq(keywordMetricsCache.projectId, ctx.projectId)).orderBy(desc(keywordMetricsCache.fetchedAt)).limit(200),
    ]),
  );
  return { searches, cachedMetrics: cached };
}

// Real, live DataForSEO calls - a "read" in the sense of no DB mutation,
// but real spend (logged to provider_spend_log same as every other real
// DataForSEO call in this app). Unconfirmed, matching how the MCP server
// already exposes these the same way.
export async function readResearchKeywords(args: { seedKeyword: string; locationCode?: number; limit?: number }) {
  const locationCode = args.locationCode ?? 2840;
  const limit = args.limit ?? 20;
  const [ideas, related, suggestions] = await Promise.all([
    getKeywordIdeas(args.seedKeyword, locationCode, limit),
    getRelatedKeywords(args.seedKeyword, locationCode, limit),
    getKeywordSuggestions(args.seedKeyword, locationCode, limit),
  ]);
  return { ideas, related, suggestions };
}

export async function readKeywordMetrics(args: { keyword: string; locationCode?: number }) {
  return getRealKeywordMetrics(args.keyword, args.locationCode);
}

export async function readSerpResults(args: { keyword: string; location?: string }) {
  return getSerpResults(args.keyword, args.location ?? "United States");
}

export async function readBacklinksOverview(args: { domain: string }) {
  return getBacklinksOverview(args.domain);
}

export async function readDomainOverview(args: { domain: string; locationCode?: number }) {
  return getDomainOverview(args.domain, args.locationCode);
}

export async function readLocalBusinessProfile(ctx: ClayToolContext) {
  const [row] = await withUserContext(ctx.userId, (tx) => tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, ctx.projectId)).limit(1));
  return row ?? null;
}

export async function readLocalGridScans(ctx: ClayToolContext, args: { limit?: number }) {
  const limit = args.limit ?? 10;
  const scans = await withUserContext(ctx.userId, (tx) =>
    tx.select().from(localGridScans).where(eq(localGridScans.projectId, ctx.projectId)).orderBy(desc(localGridScans.createdAt)).limit(limit),
  );
  const scanIds = scans.map((s) => s.id);
  const points = scanIds.length ? await withUserContext(ctx.userId, (tx) => tx.select().from(localGridScanPoints).where(inArray(localGridScanPoints.scanId, scanIds))) : [];
  return scans.map((scan) => ({ ...scan, points: points.filter((p) => p.scanId === scan.id) }));
}

export async function readBingPerformance(ctx: ClayToolContext, args: { startDate?: string; endDate?: string }) {
  const [project] = await withUserContext(ctx.userId, (tx) => tx.select({ bingSiteUrl: projects.bingSiteUrl }).from(projects).where(eq(projects.id, ctx.projectId)).limit(1));
  if (!project?.bingSiteUrl) return { error: "This project has no Bing Webmaster Tools site connected." };

  const end = args.endDate ?? new Date().toISOString().slice(0, 10);
  const startDefault = new Date();
  startDefault.setDate(startDefault.getDate() - 28);
  const start = args.startDate ?? startDefault.toISOString().slice(0, 10);

  return getBingRankAndTrafficStats(project.bingSiteUrl, start, end);
}

export async function readOutreachTargets(ctx: ClayToolContext) {
  return withUserContext(ctx.userId, (tx) => tx.select().from(outreachTargets).where(eq(outreachTargets.projectId, ctx.projectId)).orderBy(desc(outreachTargets.createdAt)));
}

export async function readBlogConnections(ctx: ClayToolContext) {
  return withUserContext(ctx.userId, (tx) =>
    tx
      .select({ id: blogConnections.id, platform: blogConnections.platform, label: blogConnections.label, status: blogConnections.status })
      .from(blogConnections)
      .where(eq(blogConnections.projectId, ctx.projectId)),
  );
}

export async function readSocialConnections(ctx: ClayToolContext) {
  return withUserContext(ctx.userId, (tx) =>
    tx
      .select({ id: socialConnections.id, platform: socialConnections.platform, label: socialConnections.label, status: socialConnections.status })
      .from(socialConnections)
      .where(eq(socialConnections.projectId, ctx.projectId)),
  );
}
