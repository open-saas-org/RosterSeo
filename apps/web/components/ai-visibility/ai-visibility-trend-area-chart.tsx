"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// Shared gradient-filled trend chart for the AI Visibility Overview page -
// same recharts/ui-chart convention as TrafficChart (Dashboard/GSC Insights),
// parameterized so Visibility % and Share of Voice % reuse one
// implementation instead of two near-identical ones.
export function AiVisibilityTrendAreaChart({
  data,
  dataKey,
  label,
  colorVar,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  label: string;
  colorVar: "var(--chart-1)" | "var(--chart-2)";
}) {
  const chartConfig = { [dataKey]: { label, color: colorVar } } satisfies ChartConfig;
  const gradientId = `fill-${dataKey}`;

  return (
    <ChartContainer config={chartConfig} className="h-[180px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.35} />
            <stop offset="95%" stopColor={`var(--color-${dataKey})`} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} fontSize={12} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area dataKey={dataKey} type="monotone" stroke={`var(--color-${dataKey})`} fill={`url(#${gradientId})`} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
