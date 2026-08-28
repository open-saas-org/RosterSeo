import { siteAudits, withUserContext } from "@seo-tool/db";
import { siteAuditDeepCheckJob } from "@seo-tool/jobs";
import { eq } from "drizzle-orm";

// Real shared logic behind POST /api/projects/:projectId/site-audit/:auditId/deep-check.
// Broken links, orphaned pages, and keyword cannibalization only make sense
// against a *finished* crawl (they read site_audit_links/site_audit_pages
// as they stood when the crawl completed), so this only enqueues against a
// "complete" audit, not a running/failed one.
export async function startDeepCheck(userId: string, auditId: string, projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [audit] = await withUserContext(userId, (tx) => tx.select({ status: siteAudits.status }).from(siteAudits).where(eq(siteAudits.id, auditId)).limit(1));
  if (!audit) return { ok: false, error: "Audit not found" };
  if (audit.status !== "complete") return { ok: false, error: "Deep check requires a completed site audit" };

  await withUserContext(userId, (tx) => tx.update(siteAudits).set({ deepCheckStatus: "pending" }).where(eq(siteAudits.id, auditId)));

  await siteAuditDeepCheckJob.enqueue({ auditId, projectId, userId });

  return { ok: true };
}
