"use client";

import { useMemo, useState } from "react";
import { MousePointerClick, Eye, Percent, ArrowDownUp, Loader2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { FilterSelect } from "@/components/ui/filter-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrafficChart } from "@/components/charts/traffic-chart";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import type { SearchConsoleRow } from "@rosterseo/google";
import { summarizeSearchConsoleRows, type GscInsightsMetrics } from "@/components/gsc-insights/gsc-insights-metrics";
import {
  aggregateByPage,
  aggregateByQuery,
  strikingDistanceRows,
  type PageAggregateRow,
  type QueryAggregateRow,
} from "@/components/gsc-insights/gsc-insights-breakdown";

const DAY_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 28, label: "Last 28 days" },
  { value: 90, label: "Last 3 months" },
] as const;

type BreakdownTab = "daily" | "queries" | "pages" | "striking";

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const dailyColumns = createDataTableColumns<SearchConsoleRow>();
const dailyTableColumns: DataTableColumnDef<SearchConsoleRow>[] = [
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
  dailyColumns.accessor("position", {
    header: "Avg. position",
    cell: (info) => <span className="tabular-nums">{info.getValue().toFixed(1)}</span>,
    sortFn: "alphanumeric",
  }),
];

const queryColumns = createDataTableColumns<QueryAggregateRow>();
const queryTableColumns: DataTableColumnDef<QueryAggregateRow>[] = [
  queryColumns.accessor("query", {
    header: "Query",
    cell: (info) => <span className="font-medium" title={info.getValue()}>{truncate(info.getValue(), 80)}</span>,
    sortFn: "text",
  }),
  queryColumns.accessor("clicks", {
    header: "Clicks",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  queryColumns.accessor("impressions", {
    header: "Impressions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  queryColumns.accessor("ctr", {
    header: "CTR",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  queryColumns.accessor("position", {
    header: "Position",
    cell: (info) => <span className="tabular-nums">{info.getValue().toFixed(1)}</span>,
    sortFn: "alphanumeric",
  }),
];

const pageColumns = createDataTableColumns<PageAggregateRow>();
const pageTableColumns: DataTableColumnDef<PageAggregateRow>[] = [
  pageColumns.accessor("page", {
    header: "Page",
    cell: (info) => (
      <a href={info.getValue()} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline" title={info.getValue()}>
        {truncate(info.getValue().replace(/^https?:\/\//, ""), 70)}
      </a>
    ),
    sortFn: "text",
  }),
  pageColumns.accessor("clicks", {
    header: "Clicks",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  pageColumns.accessor("impressions", {
    header: "Impressions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  pageColumns.accessor("ctr", {
    header: "CTR",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  pageColumns.accessor("position", {
    header: "Position",
    cell: (info) => <span className="tabular-nums">{info.getValue().toFixed(1)}</span>,
    sortFn: "alphanumeric",
  }),
];

const strikingColumns = createDataTableColumns<SearchConsoleRow>();
const strikingTableColumns: DataTableColumnDef<SearchConsoleRow>[] = [
  strikingColumns.accessor("query", {
    header: "Query",
    cell: (info) => <span className="font-medium" title={info.getValue()}>{truncate(info.getValue() ?? "", 60)}</span>,
    sortFn: "text",
  }),
  strikingColumns.accessor("page", {
    header: "Page",
    cell: (info) => (
      <a href={info.getValue()} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline" title={info.getValue()}>
        {truncate((info.getValue() ?? "").replace(/^https?:\/\//, ""), 50)}
      </a>
    ),
    sortFn: "text",
  }),
  strikingColumns.accessor("impressions", {
    header: "Impressions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  strikingColumns.accessor("clicks", {
    header: "Clicks",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  strikingColumns.accessor("position", {
    header: "Position",
    cell: (info) => <span className="tabular-nums">{info.getValue().toFixed(1)}</span>,
    sortFn: "alphanumeric",
  }),
];

export function GscInsightsWorkspace({
  projectId,
  domain,
  initialDays,
  initialDailyRows,
  initialQueryPageRows,
}: {
  projectId: string;
  domain: string;
  initialDays: number;
  initialDailyRows: SearchConsoleRow[];
  initialQueryPageRows: SearchConsoleRow[];
}) {
  const [days, setDays] = useState(initialDays);
  const [dailyRows, setDailyRows] = useState(initialDailyRows);
  const [queryPageRows, setQueryPageRows] = useState(initialQueryPageRows);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<BreakdownTab>("daily");

  async function handleDaysChange(value: string | null) {
    const nextDays = Number(value);
    setDays(nextDays);
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/gsc-insights?days=${nextDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "needs_reconnect" ? "Search Console needs reconnecting." : "Couldn't load that range.");
      setDailyRows(data.dailyRows ?? []);
      setQueryPageRows(data.queryPageRows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that range. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // GSC's real API doesn't guarantee row order without an explicit orderBy
  // (getSearchConsolePerformance doesn't request one) - sorted here,
  // ascending, once, and used everywhere below (table, chart, and the
  // period-over-period delta math in summarizeSearchConsoleRows, which
  // splits the array in half assuming chronological order - an unsorted
  // array would silently compare the wrong two halves).
  const sortedDailyRows = useMemo(() => [...dailyRows].sort((a, b) => a.date.localeCompare(b.date)), [dailyRows]);
  const metrics: GscInsightsMetrics | null = useMemo(() => (sortedDailyRows.length > 0 ? summarizeSearchConsoleRows(sortedDailyRows) : null), [sortedDailyRows]);
  const chartData = useMemo(() => sortedDailyRows.map((row) => ({ date: formatChartDate(row.date), clicks: row.clicks, impressions: row.impressions })), [sortedDailyRows]);
  const queryRows = useMemo(() => aggregateByQuery(queryPageRows).sort((a, b) => b.impressions - a.impressions), [queryPageRows]);
  const pageRows = useMemo(() => aggregateByPage(queryPageRows).sort((a, b) => b.impressions - a.impressions), [queryPageRows]);
  const strikingRows = useMemo(() => strikingDistanceRows(queryPageRows), [queryPageRows]);

  // Search Console's real Search Analytics API - unlike the Search Console
  // *website* - never returns the most recent 1-3 days: Google explicitly
  // withholds not-yet-finalized data from this API (the website shows a
  // preliminary version of very recent days through a separate, non-API
  // pipeline). This computes the actual latest real date returned, so that
  // gap is visible and honest instead of the page just looking "stale" for
  // no stated reason - every load here is a live, uncached call to Google.
  const latestDataDate = sortedDailyRows.length > 0 ? sortedDailyRows[sortedDailyRows.length - 1]!.date : null;
  const daysBehind = useMemo(() => {
    if (!latestDataDate) return null;
    const diffMs = Date.now() - new Date(`${latestDataDate}T00:00:00Z`).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [latestDataDate]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GSC Insights"
        description={`Search Console performance for ${domain}.`}
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
          <MetricCard label="Average position" value={metrics.avgPosition.toFixed(1)} deltaLabel={metrics.positionDeltaLabel} trend={metrics.positionTrend} icon={ArrowDownUp} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-seo" />
            Search Console traffic
          </CardTitle>
          <CardDescription>
            Clicks and impressions over {sortedDailyRows.length} days
            {latestDataDate ? (
              <>
                {" "}
                · data current through {formatChartDate(latestDataDate)}
                {daysBehind !== null && daysBehind > 1 ? ` (Google hasn't finalized the last ${daysBehind} days yet - this is expected, not a bug)` : ""}
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrafficChart data={chartData} />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Tabs value={activeBreakdownTab} onValueChange={(v) => setActiveBreakdownTab(v as BreakdownTab)}>
          <div className="border-b px-3">
            <TabsList variant="line">
              <TabsTrigger value="daily">Daily performance</TabsTrigger>
              <TabsTrigger value="queries">Queries ({queryRows.length})</TabsTrigger>
              <TabsTrigger value="pages">Pages ({pageRows.length})</TabsTrigger>
              <TabsTrigger value="striking">Striking distance ({strikingRows.length})</TabsTrigger>
            </TabsList>
          </div>
          <div>
            <TabsContent value="daily">
              <DataTable columns={dailyTableColumns} data={sortedDailyRows} pageSize={10} emptyMessage="No Search Console data yet." bordered={false} />
            </TabsContent>
            <TabsContent value="queries">
              <DataTable columns={queryTableColumns} data={queryRows} pageSize={20} emptyMessage="No query data for this range." bordered={false} />
            </TabsContent>
            <TabsContent value="pages">
              <DataTable columns={pageTableColumns} data={pageRows} pageSize={20} emptyMessage="No page data for this range." bordered={false} />
            </TabsContent>
            <TabsContent value="striking">
              <DataTable
                columns={strikingTableColumns}
                data={strikingRows}
                pageSize={20}
                emptyMessage="No queries in striking distance for this range."
                bordered={false}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
