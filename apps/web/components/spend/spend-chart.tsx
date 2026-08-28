"use client";

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PROVIDER_LABELS } from "@/lib/spend-labels";

// Only 6 categorical chart-color tokens exist in this app's theme
// (--chart-1..6) - a deployment with real spend across more than 6
// providers at once folds the smallest into "Other" rather than
// generating a 7th hue (dataviz skill: "a 9th series is never a generated
// hue - it folds into Other").
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const MAX_SERIES = CHART_COLORS.length;

export function SpendChart({ daily }: { daily: Array<{ date: string; byProvider: Record<string, number> }> }) {
  const totalsByProvider = new Map<string, number>();
  for (const day of daily) {
    for (const [provider, cost] of Object.entries(day.byProvider)) {
      totalsByProvider.set(provider, (totalsByProvider.get(provider) ?? 0) + cost);
    }
  }
  const rankedProviders = [...totalsByProvider.entries()].sort((a, b) => b[1] - a[1]).map(([provider]) => provider);
  const topProviders = rankedProviders.slice(0, MAX_SERIES);
  const overflowProviders = new Set(rankedProviders.slice(MAX_SERIES));

  const series = overflowProviders.size > 0 ? [...topProviders, "other"] : topProviders;

  const chartConfig: ChartConfig = Object.fromEntries(
    series.map((provider, i) => [
      provider,
      { label: provider === "other" ? "Other" : (PROVIDER_LABELS[provider] ?? provider), color: CHART_COLORS[i % CHART_COLORS.length] },
    ]),
  );

  const data = daily.map((day) => {
    const row: Record<string, string | number> = { date: day.date };
    for (const provider of topProviders) row[provider] = day.byProvider[provider] ?? 0;
    if (overflowProviders.size > 0) {
      row.other = [...overflowProviders].reduce((sum, p) => sum + (day.byProvider[p] ?? 0), 0);
    }
    return row;
  });

  if (series.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No spend recorded in the last 30 days.
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={48} tickFormatter={(v) => `$${v}`} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${Number(value).toFixed(4)}`} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((provider, i) => (
          <Bar
            key={provider}
            dataKey={provider}
            name={provider === "other" ? "Other" : (PROVIDER_LABELS[provider] ?? provider)}
            stackId="spend"
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            stroke="var(--background)"
            strokeWidth={2}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
