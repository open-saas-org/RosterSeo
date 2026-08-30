import { siteAudits, siteAuditPages, siteAuditIssues, siteAuditLinks, withUserContext } from "@rosterseo/db";
import { count, eq } from "drizzle-orm";
import { fetchPageSpeedMetrics } from "@rosterseo/google/pagespeed";
import { assertPublicHost, deriveIssues } from "@rosterseo/crawler";
import { crawlSite } from "./crawler";
import { insertLinkRows, type LinkRow } from "./site-audit-deep-check-runner";

export type { IssueSeverity } from "@rosterseo/crawler";
import type { IssueSeverity } from "@rosterseo/crawler";

interface IssueRow {
  auditId: string;
  url: string;
  severity: IssueSeverity;
  category: string;
  description: string;
}

function buildCrawlUrl(domain: string, path: string): string {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const cleanPath = path === "/" ? "/" : `/${path.replace(/^\/+/, "")}`;
  return `https://${cleanDomain}${cleanPath}`;
}

const SITEMAP_FETCH_TIMEOUT_MS = 5000;
const MAX_CHILD_SITEMAPS = 10;

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
}

async function fetchXml(url: string): Promise<string | null> {
  try {
    // Child sitemap URLs come from <loc> tags in a real fetched sitemap -
    // if a target site's sitemap.xml were ever attacker-controlled, a
    // <loc> pointing at an internal address would otherwise get fetched
    // with no check, same class of gap as the main crawl.
    await assertPublicHost(url);
    const res = await fetch(url, { headers: { "User-Agent": "SEOToolBot/1.0" }, signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// Seeds the crawl frontier from the sitemap (if any) so the crawler starts
// with real, known-good URLs instead of relying purely on link discovery
// from the homepage. Real link discovery (crawlSite) takes it from here -
// this is a starting point, not the page-list ceiling it used to be.
async function getSitemapSeedUrls(domain: string, max: number, customSitemapUrl?: string): Promise<string[]> {
  try {
    let sitemapUrl = customSitemapUrl || `https://${domain}/sitemap.xml`;
    let xml = await fetchXml(sitemapUrl);

    if (xml === null) {
      const robotsTxt = await fetchXml(`https://${domain}/robots.txt`);
      const match = robotsTxt?.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i);
      if (match?.[1]) {
        sitemapUrl = match[1];
        xml = await fetchXml(sitemapUrl);
      }
    }

    if (xml === null) return [];

    const locs = extractLocs(xml);
    if (locs.length === 0) return [];

    // A sitemap *index* lists other sitemap files, not pages - crawling
    // those .xml URLs as if they were content pages produces garbage page
    // rows and wastes PageSpeed calls on files that aren't HTML. Fetch a
    // bounded number of the child sitemaps instead and use their <loc>
    // entries (the real page URLs).
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    if (isIndex) {
      const pageUrls: string[] = [];
      for (const childUrl of locs.slice(0, MAX_CHILD_SITEMAPS)) {
        if (pageUrls.length >= max) break;
        const childXml = await fetchXml(childUrl);
        if (childXml === null) continue;
        pageUrls.push(...extractLocs(childXml).filter((url) => url.includes(domain) && !url.endsWith(".xml")));
      }
      return pageUrls.slice(0, max);
    }

    return locs.filter((url) => url.includes(domain) && !url.endsWith(".xml")).slice(0, max);
  } catch (err) {
    console.error(`Failed to fetch sitemap for ${domain}:`, err);
    return [];
  }
}

// Health score deducts per severity based on the *share of crawled pages*
// affected, capped so no single severity can zero the score alone - but a
// pure percentage has its own failure mode on a large site: a real,
// genuine issue on a handful of pages out of thousands works out to a
// deduction under 0.5, which used to get rounded away to exactly 0 before
// the final sum - the site could have real issues and still show 100/100.
// minFloor guarantees a real, visible deduction the moment ANY page has
// that severity, regardless of how tiny the percentage is; the
// percentage-based number takes over once it grows past the floor, so a
// widespread problem still scores meaningfully worse than a single
// isolated one.
const SEVERITY_SCORE_IMPACT: Record<IssueSeverity, { cap: number; minFloor: number }> = {
  critical: { cap: 60, minFloor: 10 },
  warning: { cap: 30, minFloor: 5 },
  info: { cap: 10, minFloor: 2 },
};

// Real Lighthouse audits (fetchPageSpeedMetrics) take 10-20s each and are
// rate-limited without an API key. Running them inline, per page, is what
// made crawls appear to hang - the visible "pages crawled" counter was
// gated on Lighthouse latency. Instead, CWV sampling runs as a separate,
// bounded, concurrent phase *after* the crawl finishes (see
// runPageSpeedSample below), so the counter the UI polls only ever reflects
// real fetch+parse speed.
const PAGESPEED_SAMPLE_LIMIT = 8;
const PAGESPEED_CONCURRENCY = 3;

// Link-graph capture (used later by the separate deep-check pass - see
// site-audit-deep-check-runner.ts) - see the table's own schema comment.
// Row cap bounds cost/risk on a pathological link-dense site (also stays
// comfortably under Postgres's ~65535 bound-parameter limit per INSERT once
// chunked - see insertLinkRows).
const MAX_LINK_ROWS_PER_AUDIT = 20_000;

// Runs Core Web Vitals sampling as its own bounded, concurrent phase after
// the crawl finishes, instead of inline per-page - a single slow Lighthouse
// run can no longer stall the pages-crawled counter the UI polls. Inserts a
// warning issue directly for any sampled page with poor CLS.
async function runPageSpeedSample(userId: string, auditId: string, urls: string[]): Promise<void> {
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      try {
        const metrics = await fetchPageSpeedMetrics(url);
        if (metrics && metrics.cls > 0.1) {
          await withUserContext(userId, (tx) =>
            tx.insert(siteAuditIssues).values({
              auditId,
              url,
              severity: "warning",
              category: "Core Web Vitals",
              description: `Poor CLS (${metrics.cls})`,
            }),
          );
        }
      } catch {
        // Best-effort only - PageSpeed failures shouldn't fail the audit.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PAGESPEED_CONCURRENCY, urls.length) }, () => worker()));
}

export async function runSiteAuditBackground(payload: {
  auditId: string;
  projectId: string;
  userId: string;
  domain: string;
  customSitemapUrl?: string;
  maxPages?: number;
}) {
  const { auditId, projectId, userId, domain, customSitemapUrl, maxPages = 200 } = payload;

  try {
    await withUserContext(userId, async (tx) => {
      await tx.update(siteAudits).set({ status: "running", startedAt: new Date() }).where(eq(siteAudits.id, auditId));
      // If this job is being retried/redelivered (worker restart, crash,
      // pg-boss redelivery after a missed ack) after already crawling part
      // of the site, clear whatever it wrote last time first - otherwise a
      // fresh crawl re-inserts pages on top of the old partial ones with
      // no way to tell them apart, and pagesCrawled (which only reflects
      // *this* attempt's count) permanently disagrees with the real
      // site_audit_pages row count the "Pages" tab shows.
      await tx.delete(siteAuditPages).where(eq(siteAuditPages.auditId, auditId));
      await tx.delete(siteAuditIssues).where(eq(siteAuditIssues.auditId, auditId));
      await tx.delete(siteAuditLinks).where(eq(siteAuditLinks.auditId, auditId));
    });

    const homepage = buildCrawlUrl(domain, "/");
    const sitemapSeeds = await getSitemapSeedUrls(domain, maxPages, customSitemapUrl);
    const seedUrls = [homepage, ...sitemapSeeds.filter((url) => url !== homepage)];

    const titleMap = new Map<string, string[]>();
    const pageSpeedCandidates: string[] = [];
    const linkRows: LinkRow[] = [];
    let linkGraphComplete = true;
    let auditDeleted = false;
    let lastCrawledCount = 0;
    let lastDiscoveredCount = 0;

    const { completed } = await crawlSite({
      seedUrls,
      maxPages,
      // Doubles as the cancel/delete check: if the audit row is gone or no
      // longer running, stop crawling instead of writing into nothing.
      shouldStop: async () => {
        const row = await withUserContext(userId, (tx) =>
          tx.query.siteAudits.findFirst({ where: (t) => eq(t.id, auditId), columns: { status: true } }),
        );
        if (!row) {
          auditDeleted = true;
          return true;
        }
        return row.status !== "running" && row.status !== "pending";
      },
      onPageCrawled: async (page, discoveredCount, crawledCount, depth) => {
        lastCrawledCount = crawledCount;
        lastDiscoveredCount = discoveredCount;

        if (page.statusCode >= 200 && page.statusCode < 400 && pageSpeedCandidates.length < PAGESPEED_SAMPLE_LIMIT) {
          pageSpeedCandidates.push(page.url);
        }

        if (page.title) {
          const existing = titleMap.get(page.title) ?? [];
          existing.push(page.url);
          titleMap.set(page.title, existing);
        }

        if (linkRows.length < MAX_LINK_ROWS_PER_AUDIT) {
          for (const link of page.links) {
            if (linkRows.length >= MAX_LINK_ROWS_PER_AUDIT) {
              linkGraphComplete = false;
              break;
            }
            linkRows.push({ sourceUrl: page.url, targetUrl: link, isExternal: false });
          }
          for (const link of page.externalLinks) {
            if (linkRows.length >= MAX_LINK_ROWS_PER_AUDIT) {
              linkGraphComplete = false;
              break;
            }
            linkRows.push({ sourceUrl: page.url, targetUrl: link, isExternal: true });
          }
        } else {
          linkGraphComplete = false;
        }

        const issues = deriveIssues(page);

        try {
          await withUserContext(userId, async (tx) => {
            await tx.insert(siteAuditPages).values({
              auditId,
              url: page.url,
              statusCode: page.statusCode,
              title: page.title,
              h1Count: page.h1Count,
              wordCount: page.wordCount,
              imageCount: page.imageCount,
              loadTimeMs: page.loadTimeMs,
              redirectedTo: page.redirectedTo,
              canonicalUrl: page.canonicalUrl,
              metaRobots: page.metaRobots,
              crawlDepth: depth,
              h2Texts: page.h2Texts.length > 0 ? page.h2Texts : null,
            });

            if (issues.length > 0) {
              await tx.insert(siteAuditIssues).values(
                issues.map((issue) => ({
                  auditId,
                  url: page.url,
                  severity: issue.severity,
                  category: issue.category,
                  description: issue.description,
                })),
              );
            }

            await tx
              .update(siteAudits)
              .set({ pagesCrawled: crawledCount, pagesDiscovered: discoveredCount })
              .where(eq(siteAudits.id, auditId));
          });
        } catch (writeError) {
          // A single page's write shouldn't sink the whole crawl - most
          // likely cause is a delete/cancel racing this exact page (the
          // audit row disappeared between the last shouldStop() check and
          // this write). The next shouldStop() call will detect that and
          // end the crawl cleanly; a transient DB hiccup just costs this
          // one page's data instead of the entire run.
          console.error(`[Site Audit Worker] Failed to persist page ${page.url} for audit ${auditId}:`, writeError);
        }
      },
    });

    if (auditDeleted) {
      // Deleted mid-crawl (cancel reuses delete) - nothing left to update or bill.
      return;
    }

    if (pageSpeedCandidates.length > 0) {
      // Crawling is done at this point (pagesCrawled already reads
      // 100%), but PageSpeed sampling (up to PAGESPEED_SAMPLE_LIMIT pages,
      // each with a real 20s timeout) can still take a good while - a
      // distinct status here means the UI can say "Analyzing performance"
      // instead of leaving "Running"/the crawl progress bar sitting at
      // 100% with no explanation for what's still happening.
      await withUserContext(userId, (tx) =>
        tx.update(siteAudits).set({ status: "analyzing" }).where(eq(siteAudits.id, auditId)),
      );
      await runPageSpeedSample(userId, auditId, pageSpeedCandidates);
    }

    // Real link graph, captured at zero extra HTTP cost during the crawl
    // above - persisted now so the finalize checks below (and the page
    // detail route) can query it.
    if (linkRows.length > 0) {
      await insertLinkRows(userId, auditId, linkRows);
    }

    // Cross-page checks that can only run once the whole crawl (and link
    // graph) is done - same phase the existing duplicate-title check
    // already runs in.
    const duplicateIssues: IssueRow[] = Array.from(titleMap.entries())
      .filter(([, urls]) => urls.length > 1)
      .flatMap(([title, urls]) =>
        urls.map((url) => ({
          auditId,
          url,
          severity: "warning" as IssueSeverity,
          category: "Content",
          description: `Duplicate title "${title}" used by ${urls.length} pages`,
        })),
      );

    const crossPageIssues = duplicateIssues;

    const { issueRows, realPagesCrawled } = await withUserContext(userId, async (tx) => {
      if (crossPageIssues.length > 0) {
        await tx.insert(siteAuditIssues).values(crossPageIssues);
      }
      const rows = await tx
        .select({ url: siteAuditIssues.url, severity: siteAuditIssues.severity })
        .from(siteAuditIssues)
        .where(eq(siteAuditIssues.auditId, auditId));
      const [pageCount] = await tx.select({ value: count() }).from(siteAuditPages).where(eq(siteAuditPages.auditId, auditId));
      return { issueRows: rows.map((r) => ({ url: r.url, severity: r.severity as IssueSeverity })), realPagesCrawled: pageCount?.value ?? lastCrawledCount };
    });

    const pagesBySeverity: Record<IssueSeverity, Set<string>> = { critical: new Set(), warning: new Set(), info: new Set() };
    for (const row of issueRows) pagesBySeverity[row.severity].add(row.url);

    const totalPages = Math.max(realPagesCrawled, 1);
    const deducted = (Object.keys(SEVERITY_SCORE_IMPACT) as IssueSeverity[]).reduce((total, severity) => {
      const affected = pagesBySeverity[severity].size;
      if (affected === 0) return total;
      const { cap, minFloor } = SEVERITY_SCORE_IMPACT[severity];
      const percentageBased = (affected / totalPages) * cap;
      return total + Math.min(cap, Math.max(minFloor, percentageBased));
    }, 0);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - deducted)));

    await withUserContext(userId, (tx) =>
      tx
        .update(siteAudits)
        .set({
          status: "complete",
          healthScore,
          // The real row count, not the in-memory crawl counter - keeps
          // this in sync with the "Pages" tab even if this job attempt
          // followed a retry/redelivery of a partially-completed one.
          pagesCrawled: realPagesCrawled,
          pagesDiscovered: lastDiscoveredCount,
          completedAt: new Date(),
          // Persisted (not just kept in this closure) so the separate,
          // on-demand deep check - which can run long after this job
          // exits - knows whether orphan detection is trustworthy without
          // re-crawling.
          crawlCompleted: completed,
          linkGraphComplete,
        })
        .where(eq(siteAudits.id, auditId)),
    );
  } catch (error) {
    console.error("[Site Audit Worker] Error processing audit", auditId, error);
    await withUserContext(userId, (tx) =>
      tx.update(siteAudits).set({ status: "failed", completedAt: new Date() }).where(eq(siteAudits.id, auditId)),
    );
    throw error;
  }
}
