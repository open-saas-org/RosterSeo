import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { siteAuditIssues, siteAuditPages, withUserContext } from "@seo-tool/db";
import { fetchAndParse, deriveIssues } from "@seo-tool/crawler";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; auditId: string; pageId: string };

// POST - re-fetches and re-parses ONE already-crawled page (not the whole
// site) and refreshes its own site_audit_pages row + site_audit_issues
// rows, using the exact same deriveIssues() logic the real crawl uses -
// lets a user confirm a fix landed without waiting on/paying for a full
// re-crawl. Cross-page state (the link graph, duplicate-title detection,
// orphan/broken-link checks) is untouched - those only make sense over the
// whole crawl and stay whatever they were as of the last full audit.
export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, auditId, pageId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [page] = await withUserContext(session.user.id, (tx) =>
    tx.select().from(siteAuditPages).where(and(eq(siteAuditPages.id, pageId), eq(siteAuditPages.auditId, auditId))).limit(1),
  );
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await fetchAndParse(page.url);
  const issues = deriveIssues(result);

  const updated = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .update(siteAuditPages)
      .set({
        statusCode: result.statusCode,
        title: result.title,
        h1Count: result.h1Count,
        wordCount: result.wordCount,
        imageCount: result.imageCount,
        loadTimeMs: result.loadTimeMs,
        redirectedTo: result.redirectedTo,
        canonicalUrl: result.canonicalUrl,
        metaRobots: result.metaRobots,
        h2Texts: result.h2Texts.length > 0 ? result.h2Texts : null,
      })
      .where(eq(siteAuditPages.id, pageId))
      .returning();

    // This page's own issues only (Duplicate title / Orphaned Pages /
    // Keyword Cannibalization / cross-page broken-link issues are keyed by
    // this url too but computed from the whole crawl - recomputing just
    // this page's own deriveIssues() output would otherwise wipe those out
    // without replacing them, so this deletes only the categories
    // deriveIssues() can produce, not every issue row for this URL).
    const ownCategories = ["Links", "Redirects", "Meta", "Content", "Accessibility", "Performance", "Indexability"];
    for (const category of ownCategories) {
      await tx.delete(siteAuditIssues).where(and(eq(siteAuditIssues.auditId, auditId), eq(siteAuditIssues.url, page.url), eq(siteAuditIssues.category, category)));
    }
    if (issues.length > 0) {
      await tx.insert(siteAuditIssues).values(issues.map((issue) => ({ auditId, url: page.url, severity: issue.severity, category: issue.category, description: issue.description })));
    }

    return row;
  });

  return NextResponse.json({ page: updated, issues });
});
