import { PageHeader } from "@/components/page-header";
import { BrandSettingsWorkspace } from "@/components/ai-visibility/brand-settings-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function AiVisibilityBrandSettingsPage() {
  const { project } = await getCurrentProject();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Brand" description="Project identity and context used across AI Visibility." />
      <BrandSettingsWorkspace
        projectId={project.id}
        name={project.name}
        domain={project.domain}
        initialContext={project.aiVisibilityContext ?? ""}
        initialAliases={project.aiVisibilityAliases ?? []}
        initialAdditionalDomains={project.aiVisibilityAdditionalDomains ?? []}
      />
    </div>
  );
}
