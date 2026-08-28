import { getAllProviders } from "@seo-tool/ai-visibility";
import { PageHeader } from "@/components/page-header";
import { ProvidersSettingsWorkspace } from "@/components/ai-visibility/providers-settings-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function AiVisibilityProvidersSettingsPage() {
  const { project } = await getCurrentProject();

  // Same real isConfigured() check the Visibility page's run picker already
  // uses (see providerStatus there) - this page toggles which providers a
  // run SAMPLES FROM, not which ones have credentials, so without this a
  // toggled-on-but-unconfigured provider looked identical to a real one.
  const providerStatus = Object.fromEntries(getAllProviders().map((p) => [p.id, p.isConfigured()])) as Record<string, boolean>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Providers"
        description="Which of the globally-configured LLM/scraper providers this project samples from on a visibility run. Connect a provider's API key on the Integrations page first."
      />
      <ProvidersSettingsWorkspace projectId={project.id} providerStatus={providerStatus} />
    </div>
  );
}
