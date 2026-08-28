import { SiteAuditDeepCheck } from "@/components/site-audit/site-audit-deep-check";
import { getCurrentProject } from "@/lib/current-project";

export default async function SiteAuditDeepCheckPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const { project } = await getCurrentProject();

  return <SiteAuditDeepCheck project={{ id: project.id, domain: project.domain }} auditId={auditId} />;
}
