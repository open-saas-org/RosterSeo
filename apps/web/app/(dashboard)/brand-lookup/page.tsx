import { PageHeader } from "@/components/page-header";
import { BrandLookupWorkspace } from "@/components/brand-lookup/brand-lookup-workspace";
import {
  AI_VISIBILITY_PROVIDERS,
  isAiVisibilityConfigured,
  isProviderConfigured,
  type AiVisibilityProvider,
} from "@seo-tool/ai-visibility";

// Server Component: the only place in this module allowed to call
// isAiVisibilityConfigured()/isProviderConfigured() directly, mirroring
// apps/web/app/(dashboard)/ai-visibility/page.tsx - those read
// process.env.*_API_KEY and must never ship into a client bundle.
//
// Brand Lookup is a one-off, ad-hoc check ("is this brand mentioned right
// now, and how") - it does not persist a tracked prompt or run on a
// schedule. For ongoing monitoring of a fixed set of prompts over time, see
// the AI Visibility module instead.
export default function BrandLookupPage() {
  const configured = isAiVisibilityConfigured();
  const providerStatus = Object.fromEntries(
    AI_VISIBILITY_PROVIDERS.map((provider) => [provider, isProviderConfigured(provider)]),
  ) as Record<AiVisibilityProvider, boolean>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brand Lookup"
        description="Run a one-off check across LLM providers: is this brand mentioned right now, and how?"
      />
      <BrandLookupWorkspace configured={configured} providerStatus={providerStatus} />
    </div>
  );
}
