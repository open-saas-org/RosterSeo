"use client";

import { useMemo, useState } from "react";
import { Users, Percent, Clock, Target, Loader2, LineChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { FilterSelect } from "@/components/ui/filter-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganicSessionsChart } from "@/components/charts/organic-sessions-chart";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import type { GA4CountryRow, GA4DeviceRow, GA4LandingPageRow, GA4OrganicTrendRow } from "@seo-tool/google";
import { summarizeGaOrganicTrend, type GaInsightsMetrics } from "@/components/ga-insights/ga-insights-metrics";

const DAY_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 28, label: "Last 28 days" },
  { value: 90, label: "Last 3 months" },
] as const;

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const landingColumns = createDataTableColumns<GA4LandingPageRow>();
const landingTableColumns: DataTableColumnDef<GA4LandingPageRow>[] = [
  landingColumns.accessor("landingPage", {
    header: "Landing page",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    sortFn: "text",
  }),
  landingColumns.accessor("sessions", {
    header: "Sessions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  landingColumns.accessor("engagementRate", {
    header: "Engagement rate",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  landingColumns.accessor("averageSessionDuration", {
    header: "Avg. duration",
    cell: (info) => <span className="tabular-nums">{formatDuration(info.getValue())}</span>,
    sortFn: "alphanumeric",
  }),
  landingColumns.accessor("conversions", {
    header: "Conversions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
];

const deviceColumns = createDataTableColumns<GA4DeviceRow>();
const deviceTableColumns: DataTableColumnDef<GA4DeviceRow>[] = [
  deviceColumns.accessor("device", {
    header: "Device",
    cell: (info) => <span className="font-medium capitalize">{info.getValue()}</span>,
    sortFn: "text",
  }),
  deviceColumns.accessor("sessions", {
    header: "Sessions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  deviceColumns.accessor("engagementRate", {
    header: "Engagement rate",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  deviceColumns.accessor("averageSessionDuration", {
    header: "Avg. duration",
    cell: (info) => <span className="tabular-nums">{formatDuration(info.getValue())}</span>,
    sortFn: "alphanumeric",
  }),
  deviceColumns.accessor("conversions", {
    header: "Conversions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
];

const countryColumns = createDataTableColumns<GA4CountryRow>();
const countryTableColumns: DataTableColumnDef<GA4CountryRow>[] = [
  countryColumns.accessor("country", {
    header: "Country",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    sortFn: "text",
  }),
  countryColumns.accessor("sessions", {
    header: "Sessions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  countryColumns.accessor("engagementRate", {
    header: "Engagement rate",
    cell: (info) => <span className="tabular-nums">{(info.getValue() * 100).toFixed(1)}%</span>,
    sortFn: "alphanumeric",
  }),
  countryColumns.accessor("averageSessionDuration", {
    header: "Avg. duration",
    cell: (info) => <span className="tabular-nums">{formatDuration(info.getValue())}</span>,
    sortFn: "alphanumeric",
  }),
  countryColumns.accessor("conversions", {
    header: "Conversions",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
];

export function GaInsightsWorkspace({
  projectId,
  initialDays,
  initialTrend,
  initialLandingPages,
  initialDeviceRows,
  initialCountryRows,
  domain,
}: {
  projectId: string;
  domain: string;
  initialDays: number;
  initialTrend: GA4OrganicTrendRow[];
  initialLandingPages: GA4LandingPageRow[];
  initialDeviceRows: GA4DeviceRow[];
  initialCountryRows: GA4CountryRow[];
}) {
  const [days, setDays] = useState(initialDays);
  const [trend, setTrend] = useState(initialTrend);
  const [landingPages, setLandingPages] = useState(initialLandingPages);
  const [deviceRows, setDeviceRows] = useState(initialDeviceRows);
  const [countryRows, setCountryRows] = useState(initialCountryRows);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDaysChange(value: string | null) {
    const nextDays = Number(value);
    setDays(nextDays);
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ga-insights?days=${nextDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "needs_reconnect" ? "Google Analytics needs reconnecting." : "Couldn't load that range.");
      setTrend(data.trend ?? []);
      setLandingPages(data.landingPages ?? []);
      setDeviceRows(data.deviceRows ?? []);
      setCountryRows(data.countryRows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that range. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const metrics: GaInsightsMetrics | null = useMemo(() => (trend.length > 0 ? summarizeGaOrganicTrend(trend) : null), [trend]);
  const chartData = useMemo(() => trend.map((row) => ({ date: formatChartDate(row.date), sessions: row.sessions })), [trend]);
  const latestDataDate = trend.length > 0 ? trend[trend.length - 1]!.date : null;
  const daysBehind = useMemo(() => {
    if (!latestDataDate) return null;
    const diffMs = Date.now() - new Date(`${latestDataDate}T00:00:00Z`).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [latestDataDate]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GA Insights"
        description={`Organic-search traffic performance for ${domain}, from Google Analytics.`}
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
          <MetricCard label="Organic sessions" value={metrics.totalSessions.toLocaleString()} deltaLabel={metrics.sessionsDeltaLabel} trend={metrics.sessionsTrend} icon={Users} />
          <MetricCard
            label="Engagement rate"
            value={(metrics.engagementRate * 100).toFixed(1)}
            suffix="%"
            deltaLabel={metrics.engagementDeltaLabel}
            trend={metrics.engagementTrend}
            icon={Percent}
          />
          <MetricCard
            label="Avg. engagement time"
            value={formatDuration(metrics.avgSessionDuration)}
            deltaLabel={metrics.durationDeltaLabel}
            trend={metrics.durationTrend}
            icon={Clock}
          />
          <MetricCard label="Conversions" value={metrics.totalConversions.toLocaleString()} deltaLabel={metrics.conversionsDeltaLabel} trend={metrics.conversionsTrend} icon={Target} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="size-4 text-seo" />
            Organic traffic
          </CardTitle>
          <CardDescription>
            Sessions from Organic Search over {trend.length} days
            {latestDataDate ? (
              <>
                {" "}
                · data current through {formatChartDate(latestDataDate)}
                {daysBehind !== null && daysBehind > 1 ? ` (Google Analytics hasn't finalized the last ${daysBehind} days yet - this is expected, not a bug)` : ""}
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganicSessionsChart data={chartData} />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Tabs defaultValue="landing-pages">
          <div className="border-b px-3">
            <TabsList variant="line">
              <TabsTrigger value="landing-pages">Landing pages ({landingPages.length})</TabsTrigger>
              <TabsTrigger value="devices">Devices ({deviceRows.length})</TabsTrigger>
              <TabsTrigger value="countries">Countries ({countryRows.length})</TabsTrigger>
            </TabsList>
          </div>
          <div>
            <TabsContent value="landing-pages">
              <DataTable columns={landingTableColumns} data={landingPages} pageSize={10} emptyMessage="No organic landing page data yet." bordered={false} />
            </TabsContent>
            <TabsContent value="devices">
              <DataTable columns={deviceTableColumns} data={deviceRows} pageSize={10} emptyMessage="No device data for this range." bordered={false} />
            </TabsContent>
            <TabsContent value="countries">
              <DataTable columns={countryTableColumns} data={countryRows} pageSize={10} emptyMessage="No country data for this range." bordered={false} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
