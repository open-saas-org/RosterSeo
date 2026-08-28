import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { siteAudits, siteAuditIssues, siteAuditPages, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { startDeepCheck } from "@/lib/site-audit/start-deep-check";

const DEEP_CHECK_CATEGORIES = ["Broken Links", "Orphaned Pages", "Keyword Cannibalization"];

// GET - status of the (on-demand, separate from the crawl itself) deep
// check pass for this audit, plus its results once complete. Broken links /
// orphaned pages / keyword cannibalization only ever run when a user
// explicitly triggers this - see startDeepCheck.
export const GET = withAuth<{ projectId: string; auditId: string }>(async (_req, ctx, session) => {
  const { projectId, auditId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [audit] = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        status: siteAudits.status,
        deepCheckStatus: siteAudits.deepCheckStatus,
        deepCheckStartedAt: siteAudits.deepCheckStartedAt,
        deepCheckCompletedAt: siteAudits.deepCheckCompletedAt,
        crawlCompleted: siteAudits.crawlCompleted,
        linkGraphComplete: siteAudits.linkGraphComplete,
        projectId: siteAudits.projectId,
      })
      .from(siteAudits)
      .where(eq(siteAudits.id, auditId))
      .limit(1),
  );
  if (!audit || audit.projectId !== projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let issues: (typeof siteAuditIssues.$inferSelect & { pageId: string | null })[] = [];
  if (audit.deepCheckStatus === "complete") {
    const [rawIssues, pages] = await withUserContext(session.user.id, async (tx) => [
      await tx.select().from(siteAuditIssues).where(eq(siteAuditIssues.auditId, auditId)),
      await tx.select({ id: siteAuditPages.id, url: siteAuditPages.url }).from(siteAuditPages).where(eq(siteAuditPages.auditId, auditId)),
    ]);
    const pageIdByUrl = new Map(pages.map((p) => [p.url, p.id]));
    issues = rawIssues.filter((i) => DEEP_CHECK_CATEGORIES.includes(i.category)).map((i) => ({ ...i, pageId: pageIdByUrl.get(i.url) ?? null }));
  }

  return NextResponse.json({
    auditStatus: audit.status,
    deepCheckStatus: audit.deepCheckStatus,
    deepCheckStartedAt: audit.deepCheckStartedAt,
    deepCheckCompletedAt: audit.deepCheckCompletedAt,
    crawlCompleted: audit.crawlCompleted,
    linkGraphComplete: audit.linkGraphComplete,
    issues,
  });
});

// POST - trigger a deep check run for this audit.
export const POST = withAuth<{ projectId: string; auditId: string }>(async (_req, ctx, session) => {
  const { projectId, auditId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await startDeepCheck(session.user.id, auditId, projectId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true });
});
