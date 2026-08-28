import { eq, desc } from "drizzle-orm";
import { siteAudits, withUserContext } from "@seo-tool/db";
import { getCurrentProject } from "@/lib/current-project";
import { SiteAuditView } from "@/components/site-audit/site-audit-view";
import { SiteAuditDetail } from "@/components/site-audit/site-audit-detail";

export default async function SiteAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { session, project } = await getCurrentProject();
  const sp = await searchParams;
  const auditId = typeof sp.auditId === "string" ? sp.auditId : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : "issues";

  if (auditId) {
    return <SiteAuditDetail project={project} auditId={auditId} tab={tab} />;
  }

  // One page, always: no separate history/picker to navigate to - go
  // straight to the latest audit. Launching a new crawl (from the "New
  // audit" toggle on the detail page, or from the empty state below when
  // there's no audit at all yet) always lands back here too.
  const [latest] = await withUserContext(session.user.id, (tx) =>
    tx.select({ id: siteAudits.id }).from(siteAudits).where(eq(siteAudits.projectId, project.id)).orderBy(desc(siteAudits.startedAt)).limit(1),
  );
  if (latest) {
    return <SiteAuditDetail project={project} auditId={latest.id} tab={tab} />;
  }

  return <SiteAuditView project={project} />;
}
