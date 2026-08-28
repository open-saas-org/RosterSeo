import { eq } from "drizzle-orm";
import Image from "next/image";
import { isGoogleOAuthConfigured } from "@seo-tool/google";
import { googleConnections, blogConnections, socialConnections, withUserContext } from "@seo-tool/db";
import { BLOG_PLATFORMS } from "@seo-tool/publishing";
import { SOCIAL_PLATFORMS } from "@seo-tool/social";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IntegrationConnectionCard } from "@/components/integrations/integration-connection-card";
import { PropertyPicker } from "@/components/integrations/property-picker";
import { PageSpeedIntegrationCard } from "@/components/integrations/pagespeed-integration-card";
import { LlmProvidersIntegrationCard } from "@/components/integrations/llm-providers-integration-card";
import { BingIntegrationCard } from "@/components/integrations/bing-integration-card";
import { IndexNowIntegrationCard } from "@/components/integrations/indexnow-integration-card";
import { PlatformStatusGrid } from "@/components/integrations/platform-status-grid";
import { isBingConfigured } from "@seo-tool/bing";
import { getCurrentProject } from "@/lib/current-project";
import { toConnectionStatus } from "@/lib/google-connection-status";

function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-xs font-semibold tracking-wide uppercase ${className ?? "text-muted-foreground"}`}>{children}</h3>;
}

export default async function IntegrationsPage() {
  const { session, project } = await getCurrentProject();
  const configured = isGoogleOAuthConfigured();

  const [connections, blogConns, socialConns] = await withUserContext(session.user.id, (tx) =>
    Promise.all([
      tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
      tx.select({ platform: blogConnections.platform }).from(blogConnections).where(eq(blogConnections.projectId, project.id)),
      tx.select({ platform: socialConnections.platform }).from(socialConnections).where(eq(socialConnections.projectId, project.id)),
    ]),
  );
  const byService = new Map(connections.map((c) => [c.service, c]));
  const gsc = toConnectionStatus(byService.get("gsc"), project.gscPropertyId, "gsc");
  const ga4 = toConnectionStatus(byService.get("ga4"), project.ga4PropertyId, "ga4");
  // No per-project "picked location" concept for gbp anymore - Local SEO
  // runs on DataForSEO's Business Data API instead (no OAuth needed), so
  // this card is just connect/disconnect plumbing kept ready for a future
  // GBP-connected feature, not wired into any picker UI right now.
  const gbp = toConnectionStatus(byService.get("gbp"), null, "gbp");
  const merchant = toConnectionStatus(byService.get("merchant"), project.merchantAccountId, "merchant");
  const projectId = project.id;
  const connectedBlogPlatforms = new Set(blogConns.map((c) => c.platform));
  const connectedSocialPlatforms = new Set(socialConns.map((c) => c.platform));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Integrations" description="Every connection across the app, in one place." />

      {!configured ? (
        <Alert variant="destructive">
          <AlertTitle>Google OAuth is not configured</AlertTitle>
          <AlertDescription>
            <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> are empty. Set both in{" "}
            <code>.env</code> to enable connecting GSC and GA4 — see the integrations docs for setup steps. The
            routes and UI below are fully wired and will work as soon as credentials are added.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <SectionHeading className="text-seo">Analytics</SectionHeading>
        <div className="grid gap-4 md:grid-cols-3">
        <IntegrationConnectionCard
          service="gsc"
          projectId={projectId}
          configured={configured}
          title="Google Search Console"
          description="Impressions, clicks, CTR, and average position."
          icon={<Image src="/search-console.svg" alt="Search Console" width={18} height={18} className="object-contain" />}
          status={gsc.status}
          connectedAt={gsc.connectedAt}
        >
          {gsc.status === "connected" && !gsc.propertyId ? (
            <PropertyPicker projectId={projectId} service="gsc" label="Search Console" />
          ) : null}
        </IntegrationConnectionCard>
        <IntegrationConnectionCard
          service="ga4"
          projectId={projectId}
          configured={configured}
          title="Google Analytics 4"
          description="Sessions and conversions for tracked pages."
          icon={<Image src="/google-analytics.svg" alt="Analytics" width={18} height={18} className="object-contain" />}
          status={ga4.status}
          connectedAt={ga4.connectedAt}
        >
          {ga4.status === "connected" && !ga4.propertyId ? (
            <PropertyPicker projectId={projectId} service="ga4" label="GA4" />
          ) : null}
        </IntegrationConnectionCard>
        <IntegrationConnectionCard
          service="gbp"
          projectId={projectId}
          configured={configured}
          title="Google Business Profile"
          description="Not used elsewhere in the app yet."
          icon={<Image src="/google-business.svg" alt="Business Profile" width={18} height={18} className="object-contain" />}
          status={gbp.status}
          connectedAt={gbp.connectedAt}
        />
        <PageSpeedIntegrationCard configured={!!process.env.GOOGLE_PAGESPEED_API_KEY} />
        <BingIntegrationCard configured={isBingConfigured()} />
        <IndexNowIntegrationCard />
        <IntegrationConnectionCard
          service="merchant"
          projectId={projectId}
          configured={configured}
          title="Google Merchant Center"
          description="Real shopping-ads performance stats: clicks, impressions, CTR, conversions."
          icon={<Image src="/google-merchant.svg" alt="Merchant Center" width={18} height={18} className="object-contain" />}
          status={merchant.status}
          connectedAt={merchant.connectedAt}
        >
          {merchant.status === "connected" && !merchant.propertyId ? (
            <PropertyPicker projectId={projectId} service="merchant" label="Merchant Center" />
          ) : null}
        </IntegrationConnectionCard>
        {/* Kept last - powers AI Visibility, distinct from every card above (no
            OAuth/connect flow, just env-var presence across 6 providers). */}
        <LlmProvidersIntegrationCard />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading className="text-publish">Sites</SectionHeading>
        <PlatformStatusGrid platforms={BLOG_PLATFORMS} connectedIds={connectedBlogPlatforms} manageHref="/publish/connections" />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading className="text-sky">Social</SectionHeading>
        <PlatformStatusGrid platforms={SOCIAL_PLATFORMS} connectedIds={connectedSocialPlatforms} manageHref="/social/connections" />
      </div>
    </div>
  );
}
