"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// Multi-series % stacked area chart - the Citation Categories / Citation
// Page Types charts, a stacked sibling of AiVisibilityTrendAreaChart's
// single-series gradient area. Keys are rendered in the order given, then
// reversed (biggest band drawn last / on top) so the chart reads the same
// as Elmo's version.
export function CitationStackedAreaChart({
  data,
  keys,
  labels,
  colors,
}: {
  data: Array<Record<string, string | number>>;
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  const chartConfig = Object.fromEntries(keys.map((k) => [k, { label: labels[k] ?? k, color: colors[k] }])) satisfies ChartConfig;
  const drawOrder = [...keys].reverse();

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={36} fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {drawOrder.map((key) => (
          <Area key={key} dataKey={key} type="monotone" stackId="1" stroke={`var(--color-${key})`} fill={`var(--color-${key})`} fillOpacity={0.7} strokeWidth={1.5} />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
