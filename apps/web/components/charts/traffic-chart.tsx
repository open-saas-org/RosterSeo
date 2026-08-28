"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  clicks: {
    label: "Clicks",
    color: "var(--chart-1)",
  },
  impressions: {
    label: "Impressions",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

// Every caller passes its own real { date, clicks, impressions }[] - one
// charting implementation shared across the Dashboard and GSC Insights
// instead of duplicating the recharts setup.
export function TrafficChart({
  data,
}: {
  data: { date: string; clicks: number; impressions: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-clicks)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-clicks)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="clicks"
          type="monotone"
          stroke="var(--color-clicks)"
          fill="url(#fillClicks)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
