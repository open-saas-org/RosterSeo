import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getGA4OrganicTrend, getMerchantProductPerformance, isGoogleOAuthConfigured } from "@rosterseo/google";
import { isBingConfigured, getBingRankAndTrafficStats } from "@rosterseo/bing";
import {
  aiVisibilityPrompts,
  aiVisibilityResults,
  trackedKeywords,
  googleConnections,
  localBusinessProfiles,
  siteAuditIssues,
  siteAudits,
  withUserContext,
} from "@rosterseo/db";
import { calculateVisibilityScore } from "@rosterseo/ai-visibility";
import Image from "next/image";
import { Globe, Key, Users, Link as LinkIcon } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { SearchPerformanceCard } from "@/components/dashboard/search-performance-card";
import { AnalyticsCard } from "@/components/dashboard/analytics-card";
import { BingPerformanceCard } from "@/components/dashboard/bing-performance-card";
import { MerchantPerformanceCard } from "@/components/dashboard/merchant-performance-card";
import { SiteAuditCard, type IssueGroup } from "@/components/dashboard/site-audit-card";
import { AiVisibilityOverviewCard } from "@/components/dashboard/ai-visibility-overview-card";
import { BusinessProfileCard } from "@/components/dashboard/business-profile-card";
import { getCurrentProject } from "@/lib/current-project";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { getDateRange } from "@/lib/date-range";
import { fetchGscExactWindow } from "@/lib/gsc-fetch";
import { fetchBacklinksOverview } from "@/app/(dashboard)/backlinks/actions";
import { summarizeSearchConsoleRows, type GscInsightsMetrics } from "@/components/gsc-insights/gsc-insights-metrics";
import { summarizeGaOrganicTrend, type GaInsightsMetrics } from "@/components/ga-insights/ga-insights-metrics";
import { summarizeBingRows, type BingInsightsMetrics } from "@/components/bing-insights/bing-insights-metrics";
import { summarizeMerchantRows, type MerchantInsightsMetrics } from "@/components/merchant-insights/merchant-insights-metrics";
import type { GA4OrganicTrendRow } from "@rosterseo/google";

const WINDOW_DAYS = 28;

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

export default async function OverviewPage() {
  const { session, project } = await getCurrentProject();
  const configured = isGoogleOAuthConfigured();

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
  );
  const gscConn = connections.find((c) => c.service === "gsc");
  const ga4Conn = connections.find((c) => c.service === "ga4");
  const merchantConn = connections.find((c) => c.service === "merchant");
  const gsc = toConnectionStatus(gscConn, project.gscPropertyId, "gsc");
  const ga4 = toConnectionStatus(ga4Conn, project.ga4PropertyId, "ga4");
  const merchant = toConnectionStatus(merchantConn, project.merchantAccountId, "merchant");
  const bingConfigured = isBingConfigured();

  let gscMetrics: GscInsightsMetrics | null = null;
  if (configured && gsc.status === "connected" && gsc.propertyId && gscConn) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, gscConn);
      const { dailyRows } = await fetchGscExactWindow(accessToken, gsc.propertyId, WINDOW_DAYS);
      if (dailyRows.length > 0) gscMetrics = summarizeSearchConsoleRows(dailyRows);
    } catch (err) {
      console.error("Dashboard GSC fetch failed", err);
    }
  }

  let gaMetrics: GaInsightsMetrics | null = null;
  if (configured && ga4.status === "connected" && ga4.propertyId && ga4Conn) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, ga4Conn);
      const { start, end } = getDateRange(WINDOW_DAYS);
      const rows: GA4OrganicTrendRow[] = await getGA4OrganicTrend(accessToken, ga4.propertyId, start, end);
      gaMetrics = summarizeGaOrganicTrend(rows);
    } catch (err) {
      console.error("Dashboard GA4 fetch failed", err);
    }
  }

  let bingMetrics: BingInsightsMetrics | null = null;
  if (bingConfigured && project.bingSiteUrl) {
    try {
      const { start, end } = getDateRange(WINDOW_DAYS);
      const rows = await getBingRankAndTrafficStats(project.bingSiteUrl, start, end);
      if (rows.length > 0) bingMetrics = summarizeBingRows(rows);
    } catch (err) {
      console.error("Dashboard Bing fetch failed", err);
    }
  }

  let merchantMetrics: MerchantInsightsMetrics | null = null;
  if (configured && merchant.status === "connected" && merchant.propertyId && merchantConn) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, merchantConn);
      const { start, end } = getDateRange(WINDOW_DAYS);
      const rows = await getMerchantProductPerformance(accessToken, merchant.propertyId, start, end);
      if (rows.length > 0) merchantMetrics = summarizeMerchantRows(rows);
    } catch (err) {
      console.error("Dashboard Merchant Center fetch failed", err);
    }
  }

  const { latestAudit, issueGroups, hasRunBefore } = await withUserContext(session.user.id, async (tx) => {
    const [audit] = await tx
      .select()
      .from(siteAudits)
      .where(and(eq(siteAudits.projectId, project.id), eq(siteAudits.status, "complete")))
      .orderBy(desc(siteAudits.completedAt))
      .limit(1);

    const [anyAudit] = await tx.select({ id: siteAudits.id }).from(siteAudits).where(eq(siteAudits.projectId, project.id)).limit(1);

    if (!audit) {
      return { latestAudit: null, issueGroups: [] as IssueGroup[], hasRunBefore: Boolean(anyAudit) };
    }

    const issues = await tx.select().from(siteAuditIssues).where(eq(siteAuditIssues.auditId, audit.id));
    const byCategory = new Map<string, IssueGroup>();
    for (const issue of issues) {
      const existing = byCategory.get(issue.category);
      if (existing) {
        existing.count += 1;
        if (SEVERITY_RANK[issue.severity as IssueGroup["severity"]] < SEVERITY_RANK[existing.severity]) {
          existing.severity = issue.severity as IssueGroup["severity"];
        }
      } else {
        byCategory.set(issue.category, { category: issue.category, severity: issue.severity as IssueGroup["severity"], count: 1 });
      }
    }
    const sorted = [...byCategory.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
    return { latestAudit: audit, issueGroups: sorted, hasRunBefore: true };
  });

  const businessProfile = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, project.id)).limit(1);
    return row ?? null;
  });

  // Real 30-day aggregate (not the AI Visibility Overview page's day-by-day
  // trend - a single rolled-up rate reads better in a compact dashboard
  // block, and the underlying rows are exactly the same real samples).
  const aiVisibilitySummary = await withUserContext(session.user.id, async (tx) => {
    const prompts = await tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id));
    const promptsTracked = prompts.filter((p) => p.enabled).length;
    const promptIds = prompts.map((p) => p.id);
    if (promptIds.length === 0) {
      return { hasPrompts: false, visibilityPercent: 0, shareOfVoicePercent: 0, promptsTracked };
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await tx
      .select()
      .from(aiVisibilityResults)
      .where(and(inArray(aiVisibilityResults.promptId, promptIds), gte(aiVisibilityResults.runAt, cutoff)));

    const brandRows = results.filter((r) => r.entityDomain === null);
    const visibilityPercent = brandRows.length > 0 ? calculateVisibilityScore(brandRows.map((r) => ({ mentioned: r.mentioned }))) : 0;

    const mentionedRows = results.filter((r) => r.mentioned);
    const brandMentions = mentionedRows.filter((r) => r.entityDomain === null).length;
    const shareOfVoicePercent = mentionedRows.length > 0 ? Math.round((brandMentions / mentionedRows.length) * 100) : 0;

    return { hasPrompts: promptsTracked > 0, visibilityPercent, shareOfVoicePercent, promptsTracked };
  });

  const topIssueGroups = issueGroups.slice(0, 3);
  const remainingIssueCount = issueGroups.slice(3).reduce((sum, g) => sum + g.count, 0);

  // Domain Authority/Backlinks card: reuses the Backlinks page's own
  // fetch-or-cache logic (fetchBacklinksOverview) instead of a read-only
  // lookup, so the dashboard populates real DataForSEO data itself on
  // first load rather than staying at 0 until the user happens to visit
  // the Backlinks page and search their own domain. Same 7-day cache the
  // Backlinks page already relies on, and the same combined overview+list
  // fetch (not just the overview) - backlinksCache is keyed one row per
  // (project, domain) with both halves written together, so a lighter
  // overview-only write here would leave a "fresh" cache row with an
  // empty backlink list for the Backlinks page to serve for up to 7 days.
  let backlinkRow: { domainRating: number; totalBacklinks: number } | null = null;
  if (project.domain) {
    try {
      const { overview } = await fetchBacklinksOverview(project.id, project.domain);
      backlinkRow = { domainRating: overview.domainRating, totalBacklinks: overview.totalBacklinks };
    } catch (err) {
      console.error("Dashboard backlinks fetch failed", err);
    }
  }

  const trackedKeywordsCount = await withUserContext(session.user.id, async (tx) => {
    const result = await tx
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, project.id));
    return result[0]?.count ?? 0;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* White-on-transparent mark on the brand-teal chip, not the black
            mark - this sits on the theme's regular background (light or
            dark depending on the viewer), not a fixed light sidebar/switcher
            surface, so it needs a background that holds up in both. */}
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary">
          <Image src="/RosterSeoLogo-white.png" alt="" width={26} height={26} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to RosterSEO</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s how {project.domain} is doing today.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Domain Authority"
          value={backlinkRow?.domainRating ?? 0}
          icon={Globe}
        />
        <MetricCard
          label="Organic Keywords"
          value={trackedKeywordsCount}
          icon={Key}
        />
        <MetricCard
          label="Organic Traffic"
          value={gaMetrics?.totalSessions ?? 0}
          deltaLabel={gaMetrics?.sessionsDeltaLabel}
          trend={gaMetrics?.sessionsTrend}
          icon={Users}
        />
        <MetricCard
          label="Backlinks"
          value={backlinkRow?.totalBacklinks ?? 0}
          icon={LinkIcon}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Site Audit leads the grid - it's the most actionable card (run a
            crawl, see what's broken), so it earns top-left over the
            read-only performance cards. */}
        <SiteAuditCard
          hasRunBefore={hasRunBefore}
          healthScore={latestAudit?.healthScore ?? null}
          pagesCrawled={latestAudit?.pagesCrawled ?? 0}
          completedAt={latestAudit?.completedAt ? latestAudit.completedAt.toISOString() : null}
          topIssueGroups={topIssueGroups}
          remainingIssueCount={remainingIssueCount}
        />
        <AiVisibilityOverviewCard
          hasPrompts={aiVisibilitySummary.hasPrompts}
          visibilityPercent={aiVisibilitySummary.visibilityPercent}
          shareOfVoicePercent={aiVisibilitySummary.shareOfVoicePercent}
          promptsTracked={aiVisibilitySummary.promptsTracked}
        />
        <SearchPerformanceCard projectId={project.id} configured={configured} connection={gsc} metrics={gscMetrics} />
        <AnalyticsCard projectId={project.id} configured={configured} connection={ga4} metrics={gaMetrics} />
        <BingPerformanceCard configured={bingConfigured} siteUrl={project.bingSiteUrl} metrics={bingMetrics} />
        <MerchantPerformanceCard projectId={project.id} configured={configured} connection={merchant} metrics={merchantMetrics} />
        <BusinessProfileCard
          profile={
            businessProfile
              ? {
                  name: businessProfile.name,
                  category: businessProfile.category,
                  address: businessProfile.address,
                  rating: businessProfile.rating,
                  reviewCount: businessProfile.reviewCount,
                  totalPhotos: businessProfile.totalPhotos,
                  lastSyncedAt: businessProfile.lastSyncedAt ? businessProfile.lastSyncedAt.toISOString() : null,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
