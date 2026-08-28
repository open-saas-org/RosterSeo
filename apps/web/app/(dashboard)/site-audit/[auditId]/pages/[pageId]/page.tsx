import { SiteAuditPageDetail } from "@/components/site-audit/site-audit-page-detail";
import { getCurrentProject } from "@/lib/current-project";

export default async function SiteAuditPageDetailPage({ params }: { params: Promise<{ auditId: string; pageId: string }> }) {
  const { auditId, pageId } = await params;
  const { project } = await getCurrentProject();

  return <SiteAuditPageDetail project={{ id: project.id, domain: project.domain }} auditId={auditId} pageId={pageId} />;
}
