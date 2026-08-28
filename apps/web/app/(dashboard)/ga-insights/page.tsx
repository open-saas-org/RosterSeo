import { eq } from "drizzle-orm";
import Link from "next/link";
import { LineChart, Plug } from "lucide-react";
import {
  getGA4CountryBreakdown,
  getGA4DeviceBreakdown,
  getGA4OrganicTrend,
  getGA4TopLandingPages,
  isGoogleOAuthConfigured,
} from "@seo-tool/google";
import { googleConnections, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentProject } from "@/lib/current-project";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { getDateRange } from "@/lib/date-range";
import { PropertyPicker } from "@/components/integrations/property-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GaInsightsWorkspace } from "@/components/ga-insights/ga-insights-workspace";
import type { GA4CountryRow, GA4DeviceRow, GA4LandingPageRow, GA4OrganicTrendRow } from "@seo-tool/google";

const DEFAULT_DAYS = 28;

// The performance VIEW for a project's GA4 connection, scoped specifically
// to Organic Search traffic (not a general-purpose GA4 dashboard - this is
// an SEO tool). Not the connect flow (that stays on /integrations).
// Connection status goes through the same toConnectionStatus() helper
// GSC Insights, Integrations, and the Dashboard card use, so no surface
// can ever disagree about whether the org's GA4 connection is live.
export default async function GaInsightsPage() {
  const { session, project } = await getCurrentProject();
  const configured = isGoogleOAuthConfigured();

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
  );
  const conn = connections.find((r) => r.service === "ga4");

  const ga4 = toConnectionStatus(conn, project.ga4PropertyId, "ga4");
  const connected = configured && ga4.status === "connected";
  const hasProperty = Boolean(ga4.propertyId);

  let trend: GA4OrganicTrendRow[] = [];
  let landingPages: GA4LandingPageRow[] = [];
  let deviceRows: GA4DeviceRow[] = [];
  let countryRows: GA4CountryRow[] = [];
  let fetchFailed = false;
  if (connected && hasProperty && conn) {
    const { start, end } = getDateRange(DEFAULT_DAYS);
    try {
      const accessToken = await getValidAccessToken(session.user.id, conn);
      [trend, landingPages, deviceRows, countryRows] = await Promise.all([
        getGA4OrganicTrend(accessToken, ga4.propertyId!, start, end),
        getGA4TopLandingPages(accessToken, ga4.propertyId!, start, end),
        getGA4DeviceBreakdown(accessToken, ga4.propertyId!, start, end),
        getGA4CountryBreakdown(accessToken, ga4.propertyId!, start, end),
      ]);
    } catch (err) {
      console.error("GA4 organic performance fetch failed", err);
      fetchFailed = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!connected || fetchFailed ? (
        <div className="flex flex-col gap-4">
          <PageHeader
            title="GA Insights"
            description={`Organic-search traffic performance for ${project.domain}, from Google Analytics.`}
          />
          {!configured ? (
            <Alert variant="destructive">
              <AlertTitle>Google OAuth is not configured</AlertTitle>
              <AlertDescription>
                <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> are empty, so Google
                Analytics can&apos;t be connected for any project yet. Set both in <code>.env</code>, then connect
                from Integrations.
              </AlertDescription>
            </Alert>
          ) : null}
          <EmptyState
            icon={LineChart}
            title={
              fetchFailed || ga4.status === "needs_reconnect"
                ? "Google Analytics needs reconnecting"
                : "Google Analytics isn't connected"
            }
            description={
              fetchFailed || ga4.status === "needs_reconnect"
                ? `Access was likely revoked from the Google account connected to ${project.domain}, or the Analytics Data API needs enabling on your Google Cloud project. Check Integrations, or reconnect if needed.`
                : `Connect Google Analytics for ${project.domain} to see organic sessions, engagement, and top landing pages here. No data is faked on this page while it's disconnected.`
            }
            action={
              <Link href="/integrations" className={cn(buttonVariants({ size: "sm" }))}>
                <Plug className="size-3.5" />
                Go to Integrations
              </Link>
            }
          />
        </div>
      ) : !hasProperty ? (
        <div className="flex flex-col gap-4">
          <PageHeader
            title="GA Insights"
            description={`Organic-search traffic performance for ${project.domain}, from Google Analytics.`}
          />
          <Card className="border-lavender/20 bg-lavender/5">
            <CardHeader>
              <CardTitle>Set your Analytics property</CardTitle>
              <CardDescription>
                Connected - choose which of your GA4 properties this project should sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PropertyPicker projectId={project.id} service="ga4" label="GA4" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <GaInsightsWorkspace
          projectId={project.id}
          domain={project.domain}
          initialDays={DEFAULT_DAYS}
          initialTrend={trend}
          initialLandingPages={landingPages}
          initialDeviceRows={deviceRows}
          initialCountryRows={countryRows}
        />
      )}
    </div>
  );
}
