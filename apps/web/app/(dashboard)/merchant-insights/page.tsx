import Link from "next/link";
import { Store, Plug } from "lucide-react";
import { eq } from "drizzle-orm";
import { isGoogleOAuthConfigured, getMerchantProductPerformance, type MerchantPerformanceRow } from "@seo-tool/google";
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
import { MerchantInsightsWorkspace } from "@/components/merchant-insights/merchant-insights-workspace";

const DEFAULT_DAYS = 28;

// The performance VIEW for a project's Merchant Center connection - not
// the connect flow (that stays on /integrations). Same shape as GSC/GA
// Insights: connection status through the shared toConnectionStatus()
// helper, a PropertyPicker for the not-yet-picked-an-account state, then
// the real workspace.
export default async function MerchantInsightsPage() {
  const { session, project } = await getCurrentProject();
  const configured = isGoogleOAuthConfigured();

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
  );
  const conn = connections.find((r) => r.service === "merchant");

  const merchant = toConnectionStatus(conn, project.merchantAccountId, "merchant");
  const connected = configured && merchant.status === "connected";
  const hasAccount = Boolean(merchant.propertyId);

  let rows: MerchantPerformanceRow[] = [];
  let fetchFailed = false;
  if (connected && hasAccount && conn) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, conn);
      const { start, end } = getDateRange(DEFAULT_DAYS);
      rows = await getMerchantProductPerformance(accessToken, merchant.propertyId!, start, end);
    } catch (err) {
      console.error("Merchant insights fetch failed", err);
      fetchFailed = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!connected || fetchFailed ? (
        <div className="flex flex-col gap-4">
          <PageHeader title="Merchant Insights" description={`Shopping-ads performance for ${project.domain}.`} />
          {!configured ? (
            <Alert variant="destructive">
              <AlertTitle>Google OAuth is not configured</AlertTitle>
              <AlertDescription>
                <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> are empty, so
                Merchant Center can&apos;t be connected for any project yet. Set both in <code>.env</code>, then
                connect from Integrations.
              </AlertDescription>
            </Alert>
          ) : null}
          <EmptyState
            icon={Store}
            title={
              fetchFailed || merchant.status === "needs_reconnect"
                ? "Merchant Center needs reconnecting"
                : "Merchant Center isn't connected"
            }
            description={
              fetchFailed
                ? `The Merchant API call failed - check that the Merchant API is enabled on your Google Cloud project (Content API for Shopping is being sunset in favor of it), or reconnect on Integrations.`
                : merchant.status === "needs_reconnect"
                  ? `Access was likely revoked from the Google account connected to ${project.domain}. Reconnect it on the Integrations page.`
                  : `Connect Merchant Center for ${project.domain} to see clicks, impressions, CTR, and conversions here. No data is faked on this page while it's disconnected.`
            }
            action={
              <Link href="/integrations" className={cn(buttonVariants({ size: "sm" }))}>
                <Plug className="size-3.5" />
                Go to Integrations
              </Link>
            }
          />
        </div>
      ) : !hasAccount ? (
        <div className="flex flex-col gap-4">
          <PageHeader title="Merchant Insights" description={`Shopping-ads performance for ${project.domain}.`} />
          <Card className="border-lavender/20 bg-lavender/5">
            <CardHeader>
              <CardTitle>Set your Merchant Center account</CardTitle>
              <CardDescription>Connected - choose which of your accessible Merchant Center accounts this project should report on.</CardDescription>
            </CardHeader>
            <CardContent>
              <PropertyPicker projectId={project.id} service="merchant" label="Merchant Center" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <MerchantInsightsWorkspace
          projectId={project.id}
          domain={project.domain}
          accountName={merchant.propertyId!}
          initialDays={DEFAULT_DAYS}
          initialRows={rows}
        />
      )}
    </div>
  );
}
