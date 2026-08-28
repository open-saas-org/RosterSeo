import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatItem } from "./stat-item";
import type { BingInsightsMetrics } from "@/components/bing-insights/bing-insights-metrics";
import { relabelWindow } from "./relabel-window";

// Same connected/needs-setup/no-site/metrics states as SearchPerformanceCard
// and AnalyticsCard, adapted for Bing's auth model: one global workspace API
// key (no per-project OAuth connection) plus a per-project site pick.
export function BingPerformanceCard({
  configured,
  siteUrl,
  metrics,
}: {
  configured: boolean;
  siteUrl: string | null;
  metrics: BingInsightsMetrics | null;
}) {
  const connected = configured && Boolean(siteUrl);

  const card = (
    <Card interactive={connected} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/bing.svg" alt="Bing" width={20} height={20} className="rounded-sm" />
          <CardTitle className="text-base font-semibold">Bing performance</CardTitle>
        </div>
        {connected ? (
          <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover/card:text-primary" />
        ) : null}
      </CardHeader>
      <CardContent>
        {!configured ? (
          <p className="text-sm text-muted-foreground">Bing Webmaster Tools isn&apos;t configured yet - see Integrations for setup.</p>
        ) : !siteUrl ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Pick a Bing site to see real clicks, impressions, and position here.</p>
            <Link href="/bing-insights" className={cn(buttonVariants({ size: "sm" }))}>
              Choose Bing site
            </Link>
          </div>
        ) : !metrics ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the last 28 days - see Bing Insights.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <StatItem
                label="Clicks"
                value={metrics.totalClicks.toLocaleString()}
                deltaLabel={relabelWindow(metrics.clicksDeltaLabel, 28)}
                trend={metrics.clicksTrend}
              />
              <StatItem
                label="Impressions"
                value={metrics.totalImpressions.toLocaleString()}
                deltaLabel={relabelWindow(metrics.impressionsDeltaLabel, 28)}
                trend={metrics.impressionsTrend}
              />
              <StatItem
                label="CTR"
                value={`${(metrics.avgCtr * 100).toFixed(1)}%`}
                deltaLabel={relabelWindow(metrics.ctrDeltaLabel, 28)}
                trend={metrics.ctrTrend}
              />
              <StatItem
                label="Avg position"
                value={metrics.avgPosition.toFixed(1)}
                deltaLabel={relabelWindow(metrics.positionDeltaLabel, 28)}
                trend={metrics.positionTrend}
              />
            </div>
            <p className="text-xs text-muted-foreground">Bing Webmaster Tools · last 28 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return connected ? (
    <Link href="/bing-insights" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
