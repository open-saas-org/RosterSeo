import { eq } from "drizzle-orm";
import { siteAudits, withUserContext } from "@rosterseo/db";
import { siteAuditJob } from "@rosterseo/jobs";

const MIN_MAX_PAGES = 10;
// A hard safety ceiling (clamp only, never the default) - protects against
// a genuinely pathological site (e.g. infinite faceted/calendar URL
// generation) from growing the link graph without bound. A real crawl
// still runs until its BFS frontier is exhausted or the wall-clock
// deadline (6 hours - apps/worker's crawler.ts) hits, whichever's first;
// this ceiling just bounds the worst case, it is not a sane default to
// launch on every "Launch audit" click.
const MAX_MAX_PAGES = 100_000;
// This WAS set to MAX_MAX_PAGES (100,000) - a real bug, not a deliberate
// choice: it meant every quick "Launch audit" click (no custom config)
// crawled up to 100,000 real pages of a real third-party site, for up to
// 6 hours, by default. Caught by actually running a real audit against
// linear.app in a browser and watching pages_discovered climb past 1,000
// with no sign of stopping. 200 matches this feature's own documented
// default (see seo-saas-prd-v1.md's Site Audit section: "a real
// user-facing input (10-5,000, default 200)").
const DEFAULT_MAX_PAGES = 200;

// Real shared logic behind POST /api/projects/:projectId/site-audit -
// extracted so Cappy's start_site_audit tool (apps/web/lib/cappy/tools/write.ts)
// enqueues the exact same real background job (apps/worker's audit-runner.ts)
// the Site Audit page's "Launch audit" button does.
export async function startSiteAudit(
  userId: string,
  project: { id: string; domain: string },
  opts: { domain?: string; customSitemapUrl?: string; maxPages?: number } = {},
) {
  const maxPages = Number.isFinite(opts.maxPages)
    ? Math.min(MAX_MAX_PAGES, Math.max(MIN_MAX_PAGES, Math.round(opts.maxPages!)))
    : DEFAULT_MAX_PAGES;

  const auditId = await withUserContext(userId, async (tx) => {
    // Site Audit keeps exactly one audit per project, not accumulating
    // history - deleting any prior audit row(s) first (cascades to their
    // pages/issues/links via onDelete: "cascade") before creating the new
    // one. A prior audit still mid-crawl is safely handled: its worker
    // loop's shouldStop() check already treats a disappeared audit row as
    // a cancel signal (see audit-runner.ts), so this doesn't race it.
    await tx.delete(siteAudits).where(eq(siteAudits.projectId, project.id));

    const [audit] = await tx
      .insert(siteAudits)
      .values({ projectId: project.id, status: "pending", pagesCrawled: 0, pagesDiscovered: 0, maxPages })
      .returning();
    return audit.id;
  });

  await siteAuditJob.enqueue({
    auditId,
    projectId: project.id,
    userId,
    domain: opts.domain?.trim() || project.domain,
    customSitemapUrl: opts.customSitemapUrl?.trim() || undefined,
    maxPages,
  });

  return auditId;
}
