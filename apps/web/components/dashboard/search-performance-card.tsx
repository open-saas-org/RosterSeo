import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatItem } from "./stat-item";
import type { GscInsightsMetrics } from "@/components/gsc-insights/gsc-insights-metrics";
import type { GoogleConnectionInfo } from "@/lib/google-connection-status";
import { relabelWindow } from "./relabel-window";

export function SearchPerformanceCard({
  projectId,
  configured,
  connection,
  metrics,
}: {
  projectId: string;
  configured: boolean;
  connection: GoogleConnectionInfo;
  metrics: GscInsightsMetrics | null;
}) {
  const connectHref = `/api/integrations/google/connect?projectId=${encodeURIComponent(projectId)}&service=gsc`;
  const connected = configured && connection.status === "connected" && Boolean(connection.propertyId);

  const card = (
    <Card interactive={connected} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/search-console.svg" alt="Google Search Console" width={20} height={20} />
          <CardTitle className="text-base font-semibold">Search performance</CardTitle>
        </div>
        {connected ? (
          <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover/card:text-primary" />
        ) : null}
      </CardHeader>
      <CardContent>
        {!configured ? (
          <p className="text-sm text-muted-foreground">Google OAuth isn&apos;t configured yet - see Integrations for setup.</p>
        ) : connection.status === "needs_reconnect" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Search Console needs reconnecting.</p>
            <Link href="/integrations" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Reconnect
            </Link>
          </div>
        ) : !connected ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Connect Search Console to see real clicks, impressions, and rankings here.</p>
            <a href={connectHref} className={cn(buttonVariants({ size: "sm" }))}>
              Connect Search Console
            </a>
          </div>
        ) : !metrics ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the last 28 days - see GSC Insights.</p>
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
            <p className="text-xs text-muted-foreground">Google Search Console · last 28 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return connected ? (
    <Link href="/gsc-insights" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
