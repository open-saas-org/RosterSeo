import { Compass, Plug } from "lucide-react";
import Link from "next/link";
import { isBingConfigured, getBingRankAndTrafficStats, type BingPerformanceRow } from "@seo-tool/bing";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentProject } from "@/lib/current-project";
import { getDateRange } from "@/lib/date-range";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BingSitePicker } from "@/components/bing-insights/bing-site-picker";
import { BingInsightsWorkspace } from "@/components/bing-insights/bing-insights-workspace";

const DEFAULT_DAYS = 28;

// Bing's equivalent of GSC Insights - a single global API key (no OAuth,
// no per-project connection row), so "connected" here just means the key
// is set; the picker below is only for which verified site this project
// reports on.
export default async function BingInsightsPage() {
  const { project } = await getCurrentProject();
  const configured = isBingConfigured();
  const hasSite = Boolean(project.bingSiteUrl);

  let rows: BingPerformanceRow[] = [];
  let fetchFailed = false;
  if (configured && hasSite) {
    try {
      const { start, end } = getDateRange(DEFAULT_DAYS);
      rows = await getBingRankAndTrafficStats(project.bingSiteUrl!, start, end);
    } catch (err) {
      console.error("Bing insights fetch failed", err);
      fetchFailed = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!configured || fetchFailed ? (
        <div className="flex flex-col gap-4">
          <PageHeader title="Bing Insights" description={`Bing Webmaster Tools performance for ${project.domain}.`} />
          {!configured ? (
            <Alert variant="destructive">
              <AlertTitle>Bing Webmaster Tools is not configured</AlertTitle>
              <AlertDescription>
                <code>BING_WEBMASTER_API_KEY</code> is empty, so Bing data can&apos;t be fetched for any project yet.
                Set it in <code>.env</code> (get a key from Bing Webmaster Tools &rarr; Settings &rarr; API access),
                then connect from Integrations.
              </AlertDescription>
            </Alert>
          ) : null}
          <EmptyState
            icon={Compass}
            title={fetchFailed ? "Couldn't reach Bing Webmaster Tools" : "Bing Webmaster Tools isn't configured"}
            description={
              fetchFailed
                ? "The Bing API call failed - double check the API key is valid and the site is verified."
                : `Set the workspace API key to see clicks, impressions, CTR, and average position for ${project.domain} here. No data is faked on this page while it's unconfigured.`
            }
            action={
              <Link href="/integrations" className={cn(buttonVariants({ size: "sm" }))}>
                <Plug className="size-3.5" />
                Go to Integrations
              </Link>
            }
          />
        </div>
      ) : !hasSite ? (
        <div className="flex flex-col gap-4">
          <PageHeader title="Bing Insights" description={`Bing Webmaster Tools performance for ${project.domain}.`} />
          <Card className="border-lavender/20 bg-lavender/5">
            <CardHeader>
              <CardTitle>Set your Bing site</CardTitle>
              <CardDescription>Choose which of your verified Bing Webmaster Tools sites this project should report on.</CardDescription>
            </CardHeader>
            <CardContent>
              <BingSitePicker projectId={project.id} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <BingInsightsWorkspace
          projectId={project.id}
          domain={project.domain}
          siteUrl={project.bingSiteUrl!}
          initialDays={DEFAULT_DAYS}
          initialRows={rows}
        />
      )}
    </div>
  );
}
