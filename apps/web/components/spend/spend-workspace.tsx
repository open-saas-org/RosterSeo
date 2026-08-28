"use client";

import { useState, useTransition } from "react";
import { CircleDollarSign, Loader2, RefreshCcw, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { SpendChart } from "@/components/spend/spend-chart";
import { PROVIDER_LABELS } from "@/lib/spend-labels";
import type { SpendSummary, SpendRecentRow } from "@/lib/spend-data";

function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function LiveOrEstimatedBadge({ hasReal, hasEstimate }: { hasReal: boolean; hasEstimate: boolean }) {
  if (hasReal && !hasEstimate) return <Badge variant="success">Live</Badge>;
  if (hasReal && hasEstimate) {
    return (
      <Tooltip>
        <TooltipTrigger render={<Badge variant="outline">Mixed</Badge>} />
        <TooltipContent>Some calls report a real cost, others are estimated from token usage or a flat per-call rate.</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline">Estimated</Badge>} />
      <TooltipContent>This provider's API doesn't return a real per-call cost - estimated from token usage (or a flat per-call rate) instead, never a real invoice.</TooltipContent>
    </Tooltip>
  );
}

const recentColumns = createDataTableColumns<SpendRecentRow>();
const recentTableColumns: DataTableColumnDef<SpendRecentRow>[] = [
  recentColumns.accessor("createdAt", {
    header: "When",
    cell: (info) => <span className="text-xs text-muted-foreground">{new Date(info.getValue()).toLocaleString()}</span>,
    sortFn: "alphanumeric",
  }),
  recentColumns.accessor("provider", {
    header: "Provider",
    cell: (info) => <span className="font-medium">{PROVIDER_LABELS[info.getValue()] ?? info.getValue()}</span>,
    sortFn: "text",
  }),
  recentColumns.accessor("model", {
    header: "Model",
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>,
    sortFn: "text",
  }),
  recentColumns.accessor("operation", {
    header: "Operation",
    cell: (info) => <span className="truncate text-xs text-muted-foreground">{info.getValue()}</span>,
  }),
  recentColumns.accessor("costUsd", {
    header: "Cost",
    cell: (info) => <span className="tabular-nums">{formatUsd(info.getValue())}</span>,
    sortFn: "alphanumeric",
  }),
  recentColumns.accessor("isEstimate", {
    header: "",
    cell: (info) => (info.getValue() ? <Badge variant="outline">Est.</Badge> : <Badge variant="success">Live</Badge>),
  }),
];

export function SpendWorkspace({ initialSummary }: { initialSummary: SpendSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/spend");
        if (!res.ok) throw new Error();
        const next: SpendSummary = await res.json();
        setSummary({ ...next, recent: next.recent.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })) });
      } catch {
        setError("Couldn't refresh spend data. Try again.");
      }
    });
  }

  const sortedProviders = [...summary.byProvider].sort((a, b) => b.totalUsd - a.totalUsd);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={refresh} disabled={isPending} className="gap-1.5">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Spend, last 30 days" value={formatUsd(summary.totalLast30dUsd)} icon={Wallet} />
        <MetricCard label="Spend, all time" value={formatUsd(summary.totalAllTimeUsd)} icon={CircleDollarSign} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily spend by provider</CardTitle>
          <CardDescription>Last 30 days - stacked by provider, real cost where the API reports one, estimated otherwise.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpendChart daily={summary.daily} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By provider</CardTitle>
          <CardDescription>All-time totals. "Live" means every logged call for that provider reports a real cost from its own API.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sortedProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spend recorded yet - it'll show up here after your first real API call.</p>
          ) : (
            sortedProviders.map((p) => (
              <div key={p.provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium">{PROVIDER_LABELS[p.provider] ?? p.provider}</span>
                  <LiveOrEstimatedBadge hasReal={p.hasReal} hasEstimate={p.hasEstimate} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{p.callCount.toLocaleString()} calls</span>
                  <span className="font-semibold tabular-nums">{formatUsd(p.totalUsd)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The last 50 logged calls, most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={recentTableColumns} data={summary.recent} pageSize={10} emptyMessage="No spend recorded yet." bordered={false} />
        </CardContent>
      </Card>
    </div>
  );
}
