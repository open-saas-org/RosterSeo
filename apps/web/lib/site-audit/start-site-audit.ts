import { eq } from "drizzle-orm";
import { siteAudits, withUserContext } from "@seo-tool/db";
import { siteAuditJob } from "@seo-tool/jobs";

const MIN_MAX_PAGES = 10;
// A hard safety ceiling, not a real feature limit - see
// site-audit-launch-control.tsx's own copy of this same reasoning. A real
// crawl runs until its BFS frontier is exhausted or the wall-clock
// deadline (apps/worker's crawler.ts) hits, never stopped early by page
// count for any real site.
const MAX_MAX_PAGES = 100_000;
const DEFAULT_MAX_PAGES = MAX_MAX_PAGES;

// Real shared logic behind POST /api/projects/:projectId/site-audit -
// extracted so Clay's start_site_audit tool (apps/web/lib/clay/tools/write.ts)
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
