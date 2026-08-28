import { getCurrentProject } from "@/lib/current-project";
import { PageAnalyzerWorkspace } from "@/components/page-analyzer/page-analyzer-workspace";
import { PageAnalyzerReportView } from "@/components/page-analyzer/page-analyzer-report-view";

export default async function PageAnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { project } = await getCurrentProject();
  const sp = await searchParams;
  const reportId = typeof sp.reportId === "string" ? sp.reportId : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";

  if (reportId) {
    return <PageAnalyzerReportView projectId={project.id} reportId={reportId} tab={tab} gscPropertyId={project.gscPropertyId} />;
  }

  return <PageAnalyzerWorkspace projectId={project.id} />;
}
