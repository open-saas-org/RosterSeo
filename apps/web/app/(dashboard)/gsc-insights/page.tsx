import { eq } from "drizzle-orm";
import Link from "next/link";
import { BarChart3, Plug } from "lucide-react";
import { isGoogleOAuthConfigured } from "@seo-tool/google";
import { googleConnections, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentProject } from "@/lib/current-project";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { fetchGscExactWindow } from "@/lib/gsc-fetch";
import { PropertyPicker } from "@/components/integrations/property-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GscInsightsWorkspace } from "@/components/gsc-insights/gsc-insights-workspace";
import type { SearchConsoleRow } from "@seo-tool/google";

const DEFAULT_DAYS = 28;

// The performance VIEW for a project's Search Console connection - not the
// connect flow (that stays on /integrations). Connection status is computed
// through the same toConnectionStatus() helper the Integrations page and
// the GET .../integrations route use, so the two pages can never disagree.
export default async function GscInsightsPage() {
  const { session, project } = await getCurrentProject();
  const configured = isGoogleOAuthConfigured();

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
  );
  const conn = connections.find((r) => r.service === "gsc");

  const gsc = toConnectionStatus(conn, project.gscPropertyId, "gsc");
  const connected = configured && gsc.status === "connected";
  const hasProperty = Boolean(gsc.propertyId);

  let dailyRows: SearchConsoleRow[] = [];
  let queryPageRows: SearchConsoleRow[] = [];
  let fetchFailed = false;
  if (connected && hasProperty && conn) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, conn);
      ({ dailyRows, queryPageRows } = await fetchGscExactWindow(accessToken, gsc.propertyId!, DEFAULT_DAYS));
    } catch (err) {
      console.error("GSC insights fetch failed", err);
      fetchFailed = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!connected || fetchFailed ? (
        <div className="flex flex-col gap-4">
          <PageHeader title="GSC Insights" description={`Search Console performance for ${project.domain}.`} />
          {!configured ? (
            <Alert variant="destructive">
              <AlertTitle>Google OAuth is not configured</AlertTitle>
              <AlertDescription>
                <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> are empty, so Search
                Console can&apos;t be connected for any project yet. Set both in <code>.env</code>, then connect from
                Integrations.
              </AlertDescription>
            </Alert>
          ) : null}
          <EmptyState
            icon={BarChart3}
            title={
              fetchFailed || gsc.status === "needs_reconnect"
                ? "Search Console needs reconnecting"
                : "Search Console isn't connected"
            }
            description={
              fetchFailed || gsc.status === "needs_reconnect"
                ? `Access was likely revoked from the Google account connected to ${project.domain}. Reconnect it on the Integrations page to see clicks, impressions, CTR, and average position here.`
                : `Connect Search Console for ${project.domain} to see clicks, impressions, CTR, and average position here. No data is faked on this page while it's disconnected.`
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
          <PageHeader title="GSC Insights" description={`Search Console performance for ${project.domain}.`} />
          <Card className="border-lavender/20 bg-lavender/5">
            <CardHeader>
              <CardTitle>Set your Search Console property</CardTitle>
              <CardDescription>
                Connected - choose which of your verified Search Console properties this project should sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PropertyPicker projectId={project.id} service="gsc" label="Search Console" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <GscInsightsWorkspace
          projectId={project.id}
          domain={project.domain}
          initialDays={DEFAULT_DAYS}
          initialDailyRows={dailyRows}
          initialQueryPageRows={queryPageRows}
        />
      )}
    </div>
  );
}
