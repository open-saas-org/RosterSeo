import { PageHeader } from "@/components/page-header";
import { SocialAnalyticsWorkspace } from "@/components/social/social-analytics-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function SocialAnalyticsPage() {
  const { project } = await getCurrentProject();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Analytics" description="Real engagement data pulled from each platform's own insights API, once your posts are live." />
      <SocialAnalyticsWorkspace projectId={project.id} />
    </div>
  );
}
