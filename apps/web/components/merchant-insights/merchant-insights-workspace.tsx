"use client";

import { useMemo, useState } from "react";
import { MousePointerClick, Eye, Percent, ShoppingCart, Loader2, Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { FilterSelect } from "@/components/ui/filter-select";
import { TrafficChart } from "@/components/charts/traffic-chart";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import type { MerchantPerformanceRow } from "@rosterseo/google";
import { summarizeMerchantRows, type MerchantInsightsMetrics } from "@/components/merchant-insights/merchant-insights-metrics";

const DAY_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 28, label: "Last 28 days" },
  { value: 90, label: "Last 3 months" },
] as const;

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const dailyColumns = createDataTableColumns<MerchantPerformanceRow>();
const dailyTableColumns: DataTableColumnDef<MerchantPerformanceRow>[] = [
  dailyColumns.accessor("date", {
    header: "Date",
    cell: (info) => <span className="font-medium">{formatChartDate(info.getValue())}</span>,
    sortFn: "text",
  }),
  dailyColumns.accessor("clicks", {
    header: "Clicks",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  dailyColumns.accessor("impressions", {
    header: "Impressions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  dailyColumns.accessor("ctr", {
    header: "CTR",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  dailyColumns.accessor("conversions", {
    header: "Conversions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
];

export function MerchantInsightsWorkspace({
  projectId,
  domain,
  accountName,
  initialDays,
  initialRows,
}: {
  projectId: string;
  domain: string;
  accountName: string;
  initialDays: number;
  initialRows: MerchantPerformanceRow[];
}) {
  const [days, setDays] = useState(initialDays);
  const [rows, setRows] = useState(initialRows);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDaysChange(value: string | null) {
    const nextDays = Number(value);
    setDays(nextDays);
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/merchant-insights?days=${nextDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error("Couldn't load that range.");
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that range. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.date.localeCompare(b.date)), [rows]);
  const metrics: MerchantInsightsMetrics | null = useMemo(() => (sortedRows.length > 0 ? summarizeMerchantRows(sortedRows) : null), [sortedRows]);
  const chartData = useMemo(() => sortedRows.map((row) => ({ date: formatChartDate(row.date), clicks: row.clicks, impressions: row.impressions })), [sortedRows]);
  const latestDataDate = sortedRows.length > 0 ? sortedRows[sortedRows.length - 1]!.date : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Merchant Insights"
        description={`Shopping-ads performance for ${domain} (${accountName}).`}
        actions={
          <div className="flex items-center gap-2">
            {isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            <FilterSelect
              value={String(days)}
              onValueChange={handleDaysChange}
              options={DAY_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
              triggerClassName="w-40"
            />
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Clicks" value={metrics.totalClicks.toLocaleString()} deltaLabel={metrics.clicksDeltaLabel} trend={metrics.clicksTrend} icon={MousePointerClick} />
          <MetricCard label="Impressions" value={metrics.totalImpressions.toLocaleString()} deltaLabel={metrics.impressionsDeltaLabel} trend={metrics.impressionsTrend} icon={Eye} />
          <MetricCard label="Average CTR" value={(metrics.avgCtr * 100).toFixed(1)} suffix="%" deltaLabel={metrics.ctrDeltaLabel} trend={metrics.ctrTrend} icon={Percent} />
          <MetricCard label="Conversions" value={metrics.totalConversions.toLocaleString()} deltaLabel={metrics.conversionsDeltaLabel} trend={metrics.conversionsTrend} icon={ShoppingCart} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="size-4 text-seo" />
            Shopping traffic
          </CardTitle>
          <CardDescription>
            Clicks and impressions over {sortedRows.length} days
            {latestDataDate ? <> · data current through {formatChartDate(latestDataDate)}</> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrafficChart data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Daily performance</CardTitle>
          <CardDescription>One row per day, aggregated across every product in this Merchant Center account.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={dailyTableColumns} data={sortedRows} pageSize={10} emptyMessage="No shopping performance data yet for this range." bordered={false} />
        </CardContent>
      </Card>
    </div>
  );
}
