import { PageHeader } from "@/components/page-header";
import { AiVisibilityPromptsWorkspace } from "@/components/ai-visibility/ai-visibility-prompts-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function AiVisibilityPromptsSettingsPage() {
  const { project } = await getCurrentProject();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Prompts" description="Add, edit, or remove your brand tracking keywords and prompts." />
      <AiVisibilityPromptsWorkspace projectId={project.id} brandName={project.name} brandDomain={project.domain} />
    </div>
  );
}
