import { PageHeader } from "@/components/page-header";
import { OpportunitiesWorkspace } from "@/components/ai-visibility/opportunities-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function OpportunitiesPage() {
  const { project } = await getCurrentProject();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Opportunities"
        description="What to create, pitch, and seed to earn more AI citations — generated from your tracked answer data."
      />
      <OpportunitiesWorkspace projectId={project.id} />
    </div>
  );
}
