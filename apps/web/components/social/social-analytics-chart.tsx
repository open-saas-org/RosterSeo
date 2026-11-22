"use client";

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  reach: { label: "Reach", color: "var(--chart-1)" },
  engagement: { label: "Engagement", color: "var(--chart-2)" },
} satisfies ChartConfig;

type TrendPoint = { date: string; reach: number; engagement: number };

// Reach/engagement-over-time line chart - same ChartContainer/recharts
// pattern as Rank Tracking's position-distribution chart
// (apps/web/components/rank-tracking/rank-tracking-position-chart.tsx),
// a line chart here rather than a stacked area since reach and engagement
// aren't parts of one whole the way position buckets are.
export function SocialAnalyticsChart({ points }: { points: TrendPoint[] }) {
  const chartData = points.map((p) => ({
    ...p,
    date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Reach &amp; engagement</CardTitle>
        <CardDescription>Summed across every connected Facebook Page/Instagram/LinkedIn post, by day.</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>No metrics fetched yet.</p>
            <p>A daily background job checks every published post on a metrics-capable platform.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <LineChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="reach" type="monotone" stroke="var(--color-reach)" strokeWidth={1.5} dot={false} />
              <Line dataKey="engagement" type="monotone" stroke="var(--color-engagement)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
