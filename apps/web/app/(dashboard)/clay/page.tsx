import { Suspense } from "react";
import { ClayWorkspace } from "@/components/clay/clay-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function ClayPage() {
  const { project } = await getCurrentProject();

  // -m-6 cancels the dashboard layout's default p-6 so Clay's chat UI runs
  // edge-to-edge instead of sitting in a padded card like every other page.
  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <Suspense fallback={null}>
        <ClayWorkspace key={project.id} projectId={project.id} domain={project.domain} />
      </Suspense>
    </div>
  );
}
