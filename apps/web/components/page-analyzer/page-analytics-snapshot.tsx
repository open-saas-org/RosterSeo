import Link from "next/link";
import { Search, TrendingUp, Plug, MousePointerClick, Eye, Percent, BarChart3, Users, FileText, Clock, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageAnalyzerGscMetrics, PageAnalyzerGa4Metrics } from "@/components/page-analyzer/analysis";
import { MetricCard } from "@/components/metric-card";

function EmptyNote({ status }: { status: "not_connected" | "no_data" | "error" }) {
  if (status === "not_connected") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <span>Not connected.</span>
        <Link href="/integrations" className={cn(buttonVariants({ size: "xs", variant: "outline" }), "ml-auto gap-1 shrink-0")}>
          <Plug className="size-3" />
          Connect
        </Link>
      </div>
    );
  }
  if (status === "no_data") {
    return <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Connected — no data found for this exact URL in the last 28 days.</p>;
  }
  return <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Data not found — the real API call failed. Re-run the analysis to retry.</p>;
}

function Section({
  icon: Icon,
  title,
  status,
  cards,
}: {
  icon: LucideIcon;
  title: string;
  status: "connected" | "not_connected" | "no_data" | "error";
  cards: { label: string; value: string; icon: LucideIcon }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      </div>
      {status === "connected" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
          ))}
        </div>
      ) : (
        <EmptyNote status={status} />
      )}
    </div>
  );
}

// Trimmed to one compact stat row per source (no more repeated amber
// "preview data" boxes fabricating numbers for a genuinely empty result -
// a real zero-traffic 28-day window gets an honest "no data" note instead).
export function PageAnalyticsSnapshot({ gsc, ga4 }: { gsc?: PageAnalyzerGscMetrics; ga4?: PageAnalyzerGa4Metrics }) {
  const gscStatus = gsc?.status ?? "not_connected";
  const ga4Status = ga4?.status ?? "not_connected";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section
        icon={Search}
        title="Search Console (last 28 days)"
        status={gscStatus}
        cards={[
          { label: "Clicks", value: (gsc?.totalClicks ?? 0).toLocaleString(), icon: MousePointerClick },
          { label: "Impressions", value: (gsc?.totalImpressions ?? 0).toLocaleString(), icon: Eye },
          { label: "CTR", value: `${((gsc?.avgCtr ?? 0) * 100).toFixed(1)}%`, icon: Percent },
          { label: "Avg. position", value: (gsc?.avgPosition ?? 0).toFixed(1), icon: BarChart3 },
        ]}
      />
      <Section
        icon={TrendingUp}
        title="Google Analytics (last 28 days)"
        status={ga4Status}
        cards={[
          { label: "Sessions", value: (ga4?.sessions ?? 0).toLocaleString(), icon: Users },
          { label: "Page views", value: (ga4?.screenPageViews ?? 0).toLocaleString(), icon: FileText },
          { label: "Engagement", value: `${((ga4?.engagementRate ?? 0) * 100).toFixed(0)}%`, icon: Percent },
          { label: "Avg. duration", value: `${Math.round(ga4?.averageSessionDuration ?? 0)}s`, icon: Clock },
        ]}
      />
    </div>
  );
}
