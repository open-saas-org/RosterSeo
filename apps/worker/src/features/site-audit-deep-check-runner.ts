import { siteAudits, siteAuditPages, siteAuditIssues, siteAuditLinks, googleConnections, projects, withUserContext } from "@rosterseo/db";
import { and, eq } from "drizzle-orm";
import { GoogleReauthRequiredError, refreshAccessToken, fetchGscExactWindow } from "@rosterseo/google";
import type { IssueSeverity } from "./audit-runner";

interface IssueRow {
  auditId: string;
  url: string;
  severity: IssueSeverity;
  category: string;
  description: string;
}

export interface LinkRow {
  sourceUrl: string;
  targetUrl: string;
  isExternal: boolean;
}

// Link-graph capture happens for free during the main crawl (see
// audit-runner.ts's onPageCrawled) - this insert helper lives here since
// it's this file's own data dependency, but audit-runner.ts calls it too.
const LINK_INSERT_CHUNK_SIZE = 2_000;

export async function insertLinkRows(userId: string, auditId: string, rows: LinkRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += LINK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + LINK_INSERT_CHUNK_SIZE);
    await withUserContext(userId, (tx) => tx.insert(siteAuditLinks).values(chunk.map((r) => ({ auditId, sourceUrl: r.sourceUrl, targetUrl: r.targetUrl, isExternal: r.isExternal }))));
  }
}

// Broken links (internal + external), orphaned pages, and keyword
// cannibalization run as their own on-demand pass over an already-completed
// audit's data - deliberately NOT part of runSiteAuditBackground. Two
// reasons: (1) external link checking + a live GSC call are the only slow,
// networked parts of Site Audit, and folding them into the same job as the
// crawl made the crawl's own job duration (and therefore its pg-boss expiry
// budget) harder to reason about; (2) the user asked for these to not be
// "mixed with the site audit" - they're a distinct, opt-in deeper pass with
// their own results page, not more rows dumped into the main Issues tab.
const MAX_EXTERNAL_LINKS_CHECKED = 300;
const EXTERNAL_LINK_CHECK_CONCURRENCY = 5;
const EXTERNAL_LINK_CHECK_TIMEOUT_MS = 8_000;
const MAX_BROKEN_LINK_ISSUES = 500;

const MAX_CANNIBALIZATION_ISSUES = 200;
const GSC_LOOKBACK_DAYS = 28;

// Same duplicate-not-cross-import pattern apps/worker/src/features/
// outreach-runner.ts already uses for Gmail: apps/worker can't reach into
// apps/web's `@/` path aliases (apps/web/lib/google-token.ts), and this
// reads from google_connections (org-scoped, keyed by service), not
// email_connections, so it's a real, distinct query anyway.
const GOOGLE_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function getValidGoogleAccessToken(userId: string, connection: typeof googleConnections.$inferSelect): Promise<string> {
  if (connection.expiresAt.getTime() - GOOGLE_TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
    return connection.accessToken;
  }
  try {
    const refreshed = await refreshAccessToken(connection.refreshToken);
    await withUserContext(userId, (tx) =>
      tx.update(googleConnections).set({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, needsReconnect: false }).where(eq(googleConnections.id, connection.id)),
    );
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      await withUserContext(userId, (tx) => tx.update(googleConnections).set({ needsReconnect: true }).where(eq(googleConnections.id, connection.id)));
    }
    throw err;
  }
}

// Internal broken links - free (every internal target already got crawled
// during the main run). Only ever flags a target that was actually crawled
// and actually failed - a link whose target was never reached (out of
// scope, robots-disallowed, past maxPages) is correctly left alone, never
// inferred as broken.
async function checkInternalBrokenLinks(userId: string, auditId: string): Promise<IssueRow[]> {
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select({ sourceUrl: siteAuditLinks.sourceUrl, targetUrl: siteAuditLinks.targetUrl, targetStatus: siteAuditPages.statusCode })
      .from(siteAuditLinks)
      .innerJoin(siteAuditPages, eq(siteAuditPages.url, siteAuditLinks.targetUrl))
      .where(and(eq(siteAuditLinks.auditId, auditId), eq(siteAuditPages.auditId, auditId), eq(siteAuditLinks.isExternal, false))),
  );

  return rows
    .filter((r) => r.targetStatus >= 400)
    .map((r) => ({
      auditId,
      url: r.sourceUrl,
      severity: "critical" as IssueSeverity,
      category: "Broken Links",
      description: `Links to a broken page: ${r.targetUrl} (HTTP ${r.targetStatus})`,
    }));
}

// External broken links - the one part of this feature with real marginal
// HTTP cost. Dedupes to unique target URLs (checked once regardless of how
// many pages link to it), capped total distinct URLs checked, HEAD-first
// with a GET fallback (HEAD support is unreliable in the wild - the
// documented industry-standard workaround), short timeout, concurrency-
// limited worker pool.
async function checkExternalBrokenLinks(userId: string, auditId: string): Promise<IssueRow[]> {
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select({ sourceUrl: siteAuditLinks.sourceUrl, targetUrl: siteAuditLinks.targetUrl })
      .from(siteAuditLinks)
      .where(and(eq(siteAuditLinks.auditId, auditId), eq(siteAuditLinks.isExternal, true))),
  );
  if (rows.length === 0) return [];

  const sourcesByTarget = new Map<string, string[]>();
  for (const r of rows) {
    const list = sourcesByTarget.get(r.targetUrl) ?? [];
    list.push(r.sourceUrl);
    sourcesByTarget.set(r.targetUrl, list);
  }

  const targets = [...sourcesByTarget.keys()].slice(0, MAX_EXTERNAL_LINKS_CHECKED);
  const broken = new Map<string, string>(); // targetUrl -> reason

  async function checkOne(url: string): Promise<void> {
    try {
      let res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(EXTERNAL_LINK_CHECK_TIMEOUT_MS), headers: { "User-Agent": "SEOToolBot/1.0" } });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(EXTERNAL_LINK_CHECK_TIMEOUT_MS), headers: { "User-Agent": "SEOToolBot/1.0" } });
      }
      if (res.status >= 400) broken.set(url, `HTTP ${res.status}`);
    } catch {
      broken.set(url, "unreachable");
    }
  }

  const queue = [...targets];
  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      await checkOne(url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(EXTERNAL_LINK_CHECK_CONCURRENCY, targets.length) }, () => worker()));

  const issues: IssueRow[] = [];
  for (const [targetUrl, reason] of broken) {
    const sources = sourcesByTarget.get(targetUrl) ?? [];
    for (const sourceUrl of sources) {
      if (issues.length >= MAX_BROKEN_LINK_ISSUES) return issues;
      issues.push({
        auditId,
        url: sourceUrl,
        severity: "warning",
        category: "Broken Links",
        description: `Links to a broken external URL: ${targetUrl} (${reason})`,
      });
    }
  }
  return issues;
}

// Orphaned pages - free, but only trustworthy when the crawl actually
// finished AND the link graph wasn't truncated (both persisted on the audit
// row at crawl completion - see audit-runner.ts). A live 2xx page is an
// orphan when no OTHER crawled page links to it and nothing redirects to it
// - never inferred on a partial crawl (false-positive risk: everything
// looks orphaned when the crawl stopped early).
async function checkOrphanPages(userId: string, auditId: string, homepageUrl: string, crawlCompleted: boolean, linkGraphComplete: boolean): Promise<IssueRow[]> {
  if (!crawlCompleted || !linkGraphComplete) return [];

  const [pages, links] = await withUserContext(userId, async (tx) => [
    await tx.select({ url: siteAuditPages.url, statusCode: siteAuditPages.statusCode, redirectedTo: siteAuditPages.redirectedTo }).from(siteAuditPages).where(eq(siteAuditPages.auditId, auditId)),
    await tx.select({ sourceUrl: siteAuditLinks.sourceUrl, targetUrl: siteAuditLinks.targetUrl }).from(siteAuditLinks).where(and(eq(siteAuditLinks.auditId, auditId), eq(siteAuditLinks.isExternal, false))),
  ]);

  const inboundTargets = new Set(links.filter((l) => l.sourceUrl !== l.targetUrl).map((l) => l.targetUrl));
  const redirectTargets = new Set(pages.filter((p) => p.redirectedTo).map((p) => p.redirectedTo!));

  const orphans = pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300 && p.url !== homepageUrl && !inboundTargets.has(p.url) && !redirectTargets.has(p.url));

  return orphans.map((p) => ({
    auditId,
    url: p.url,
    severity: "warning" as IssueSeverity,
    category: "Orphaned Pages",
    description: "No other page on the site links to this page - it can only be found via a direct URL or the sitemap.",
  }));
}

// Keyword cannibalization - free, GSC-only (no paid fallback - a
// per-keyword rank-tracking API is a strictly worse signal for a
// cost-conscious tool). Skipped entirely, not approximated, when the
// project has no GSC property connected.
async function checkKeywordCannibalization(userId: string, auditId: string, projectId: string): Promise<IssueRow[]> {
  const [project] = await withUserContext(userId, (tx) => tx.select({ organizationId: projects.organizationId, gscPropertyId: projects.gscPropertyId }).from(projects).where(eq(projects.id, projectId)).limit(1));
  if (!project?.gscPropertyId) return [];

  const [connection] = await withUserContext(userId, (tx) =>
    tx.select().from(googleConnections).where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, "gsc"))).limit(1),
  );
  if (!connection) return [];

  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(userId, connection);
  } catch {
    return [];
  }

  const { queryPageRows } = await fetchGscExactWindow(accessToken, project.gscPropertyId, GSC_LOOKBACK_DAYS);

  const byQuery = new Map<string, { page: string; clicks: number }[]>();
  for (const row of queryPageRows) {
    if (!row.query || !row.page) continue;
    const list = byQuery.get(row.query) ?? [];
    list.push({ page: row.page, clicks: row.clicks });
    byQuery.set(row.query, list);
  }

  const issues: IssueRow[] = [];
  for (const [query, rows] of byQuery) {
    const distinctPages = [...new Map(rows.map((r) => [r.page, r])).values()];
    if (distinctPages.length < 2) continue;
    if (!distinctPages.some((r) => r.clicks > 0)) continue; // at least one competing page has real clicks, not just impressions

    for (const row of distinctPages) {
      if (issues.length >= MAX_CANNIBALIZATION_ISSUES) return issues;
      const others = distinctPages.filter((r) => r.page !== row.page);
      issues.push({
        auditId,
        url: row.page,
        severity: "warning",
        category: "Keyword Cannibalization",
        description: `Competes with ${others.length} other page${others.length === 1 ? "" : "s"} for "${query}" (both showing in Search Console)`,
      });
    }
  }
  return issues;
}

function buildHomepageUrl(domain: string): string {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${cleanDomain}/`;
}

// Deletes only this pass's own issue categories before re-inserting -
// leaves the main crawl's issues (Meta, Content, Links "Broken page",
// Redirects, etc.) completely untouched, since this is a supplementary
// pass over the same audit, not a re-run of it.
const DEEP_CHECK_CATEGORIES = ["Broken Links", "Orphaned Pages", "Keyword Cannibalization"];

export async function runSiteAuditDeepCheck(payload: { auditId: string; projectId: string; userId: string }): Promise<void> {
  const { auditId, projectId, userId } = payload;

  const [audit] = await withUserContext(userId, (tx) =>
    tx
      .select({ status: siteAudits.status, crawlCompleted: siteAudits.crawlCompleted, linkGraphComplete: siteAudits.linkGraphComplete, domain: projects.domain })
      .from(siteAudits)
      .innerJoin(projects, eq(projects.id, siteAudits.projectId))
      .where(eq(siteAudits.id, auditId))
      .limit(1),
  );
  if (!audit || audit.status !== "complete") return;

  await withUserContext(userId, (tx) =>
    tx.update(siteAudits).set({ deepCheckStatus: "running", deepCheckStartedAt: new Date() }).where(eq(siteAudits.id, auditId)),
  );

  try {
    const homepage = buildHomepageUrl(audit.domain);

    const [internalBroken, externalBroken, orphanIssues, cannibalizationIssues] = await Promise.all([
      checkInternalBrokenLinks(userId, auditId),
      checkExternalBrokenLinks(userId, auditId),
      checkOrphanPages(userId, auditId, homepage, audit.crawlCompleted, audit.linkGraphComplete),
      checkKeywordCannibalization(userId, auditId, projectId),
    ]);

    const issues = [...internalBroken, ...externalBroken, ...orphanIssues, ...cannibalizationIssues];

    await withUserContext(userId, async (tx) => {
      for (const category of DEEP_CHECK_CATEGORIES) {
        await tx.delete(siteAuditIssues).where(and(eq(siteAuditIssues.auditId, auditId), eq(siteAuditIssues.category, category)));
      }
      if (issues.length > 0) {
        await tx.insert(siteAuditIssues).values(issues);
      }
      await tx.update(siteAudits).set({ deepCheckStatus: "complete", deepCheckCompletedAt: new Date() }).where(eq(siteAudits.id, auditId));
    });
  } catch (error) {
    console.error("[Site Audit Deep Check Worker] Error processing audit", auditId, error);
    await withUserContext(userId, (tx) =>
      tx.update(siteAudits).set({ deepCheckStatus: "failed", deepCheckCompletedAt: new Date() }).where(eq(siteAudits.id, auditId)),
    );
    throw error;
  }
}
