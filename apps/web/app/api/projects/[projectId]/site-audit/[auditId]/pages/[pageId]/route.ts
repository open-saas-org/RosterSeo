import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { siteAuditIssues, siteAuditLinks, siteAuditPages, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; auditId: string; pageId: string };

// GET - one crawled page's full detail: its own issues (including the new
// broken-link/orphan/cannibalization categories, which are just more rows
// in the same site_audit_issues table), plus real inbound/outbound link
// data from site_audit_links - the "page detail" view Site Audit's flat
// Pages tab never had before.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, auditId, pageId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [page] = await withUserContext(session.user.id, (tx) =>
    tx.select().from(siteAuditPages).where(and(eq(siteAuditPages.id, pageId), eq(siteAuditPages.auditId, auditId))).limit(1),
  );
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [issues, inboundLinks, outboundLinks] = await withUserContext(session.user.id, async (tx) => [
    await tx.select().from(siteAuditIssues).where(and(eq(siteAuditIssues.auditId, auditId), eq(siteAuditIssues.url, page.url))),
    await tx
      .select({ sourceUrl: siteAuditLinks.sourceUrl })
      .from(siteAuditLinks)
      .where(and(eq(siteAuditLinks.auditId, auditId), eq(siteAuditLinks.targetUrl, page.url), eq(siteAuditLinks.isExternal, false))),
    await tx
      .select({ targetUrl: siteAuditLinks.targetUrl, isExternal: siteAuditLinks.isExternal })
      .from(siteAuditLinks)
      .where(and(eq(siteAuditLinks.auditId, auditId), eq(siteAuditLinks.sourceUrl, page.url))),
  ]);

  // Real target status for internal outbound links, if that target was
  // itself crawled - lets the UI show "broken" inline without a second
  // round trip. External targets don't get a live status here (the check
  // already ran once during the audit and produced a real issue row if it
  // failed - see `issues` above).
  const internalTargets = outboundLinks.filter((l) => !l.isExternal).map((l) => l.targetUrl);
  const targetStatuses =
    internalTargets.length > 0
      ? await withUserContext(session.user.id, (tx) =>
          tx.select({ url: siteAuditPages.url, statusCode: siteAuditPages.statusCode }).from(siteAuditPages).where(eq(siteAuditPages.auditId, auditId)),
        )
      : [];
  const statusByUrl = new Map(targetStatuses.map((t) => [t.url, t.statusCode]));

  return NextResponse.json({
    page,
    issues,
    inboundLinks: [...new Set(inboundLinks.map((l) => l.sourceUrl))],
    outboundLinks: outboundLinks.map((l) => ({ targetUrl: l.targetUrl, isExternal: l.isExternal, statusCode: l.isExternal ? null : (statusByUrl.get(l.targetUrl) ?? null) })),
  });
});

const VALID_ACTIONS = new Set(["no_action", "in_progress", "fixed"]);

// PATCH - manual per-page triage (Action / Notes), set by a user working
// through issues after a crawl - never written by the crawler itself.
export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, auditId, pageId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<{ action: string; notes: string | null }> = {};
  if (typeof body.action === "string") {
    if (!VALID_ACTIONS.has(body.action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    updates.action = body.action;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes : null;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx.update(siteAuditPages).set(updates).where(and(eq(siteAuditPages.id, pageId), eq(siteAuditPages.auditId, auditId))).returning(),
  );
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ page: updated });
});
