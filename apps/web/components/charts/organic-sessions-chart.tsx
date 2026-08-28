"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  sessions: {
    label: "Organic sessions",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// Same recharts/ChartContainer setup as traffic-chart.tsx, kept as its own
// small component rather than forcing GA4's field names through
// TrafficChart, which is hardcoded to clicks/impressions.
export function OrganicSessionsChart({ data }: { data: { date: string; sessions: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-sessions)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-sessions)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="sessions"
          type="monotone"
          stroke="var(--color-sessions)"
          fill="url(#fillSessions)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
