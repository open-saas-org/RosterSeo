import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatItem } from "./stat-item";
import type { GaInsightsMetrics } from "@/components/ga-insights/ga-insights-metrics";
import type { GoogleConnectionInfo } from "@/lib/google-connection-status";
import { relabelWindow } from "./relabel-window";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AnalyticsCard({
  projectId,
  configured,
  connection,
  metrics,
}: {
  projectId: string;
  configured: boolean;
  connection: GoogleConnectionInfo;
  metrics: GaInsightsMetrics | null;
}) {
  const connectHref = `/api/integrations/google/connect?projectId=${encodeURIComponent(projectId)}&service=ga4`;
  const connected = configured && connection.status === "connected" && Boolean(connection.propertyId);

  const card = (
    <Card interactive={connected} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/google-analytics.svg" alt="Google Analytics" width={20} height={20} />
          <CardTitle className="text-base font-semibold">Google Analytics</CardTitle>
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
            <p className="text-sm text-muted-foreground">Google Analytics needs reconnecting.</p>
            <Link href="/integrations" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Reconnect
            </Link>
          </div>
        ) : !connected ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Connect Google Analytics to see real organic sessions and conversions here.</p>
            <a href={connectHref} className={cn(buttonVariants({ size: "sm" }))}>
              Connect Google Analytics
            </a>
          </div>
        ) : !metrics ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the last 28 days - see GA Insights.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <StatItem
                label="Sessions"
                value={metrics.totalSessions.toLocaleString()}
                deltaLabel={relabelWindow(metrics.sessionsDeltaLabel, 28)}
                trend={metrics.sessionsTrend}
              />
              <StatItem
                label="Engagement rate"
                value={`${(metrics.engagementRate * 100).toFixed(0)}%`}
                deltaLabel={relabelWindow(metrics.engagementDeltaLabel, 28)}
                trend={metrics.engagementTrend}
              />
              <StatItem
                label="Avg duration"
                value={formatDuration(metrics.avgSessionDuration)}
                deltaLabel={relabelWindow(metrics.durationDeltaLabel, 28)}
                trend={metrics.durationTrend}
              />
              <StatItem
                label="Conversions"
                value={metrics.totalConversions.toLocaleString()}
                deltaLabel={relabelWindow(metrics.conversionsDeltaLabel, 28)}
                trend={metrics.conversionsTrend}
              />
            </div>
            <p className="text-xs text-muted-foreground">Google Analytics 4 · organic search · last 28 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return connected ? (
    <Link href="/ga-insights" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
