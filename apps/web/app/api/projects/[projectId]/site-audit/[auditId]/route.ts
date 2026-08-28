import { NextResponse } from "next/server";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { siteAudits, withUserContext } from "@seo-tool/db";
import { and, eq } from "drizzle-orm";

export const GET = withAuth(async (req, { params }, session) => {
  const { projectId, auditId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const audit = await withUserContext(session.user.id, (tx) =>
    tx.query.siteAudits.findFirst({
      where: (t) => eq(t.id, auditId),
      with: {
        siteAuditIssues: true,
        siteAuditPages: true,
      },
    })
  );

  if (!audit || audit.projectId !== projectId) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json(audit);
});

// Also doubles as "cancel" for a running audit: the worker checks (between
// crawl batches) whether its own audit row still exists, and stops crawling
// as soon as it's gone instead of continuing to write into nothing.
export const DELETE = withAuth(async (req, { params }, session) => {
  const { projectId, auditId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scoped by both id AND projectId in the WHERE itself, not just checked
  // after the fact - the old version deleted by id alone and only compared
  // projectId once the row was already gone, so a stale tab or a hand-
  // edited URL referencing an audit under a DIFFERENT project in the same
  // org could delete/cancel it while still reporting a misleading 404.
  const deleted = await withUserContext(session.user.id, async (tx) => {
    const [audit] = await tx
      .delete(siteAudits)
      .where(and(eq(siteAudits.id, auditId), eq(siteAudits.projectId, projectId)))
      .returning({ id: siteAudits.id });
    return audit;
  });

  if (!deleted) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
