"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  volume: {
    label: "Search volume",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// Last-12-months month labels ending at the current month - an
// approximation (the trend array itself is just 12 ordered numbers, no
// year/month metadata survives toKeywordMetrics), but close enough for a
// trend shape and matches what "last 12 months" visually implies.
function monthLabels(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return d.toLocaleDateString("en-US", { month: "short" });
  });
}

export function KeywordSearchTrendsChart({ keyword, trend }: { keyword: string; trend: number[] }) {
  const labels = monthLabels();
  const data = trend.map((volume, i) => ({ month: labels[i] ?? "", volume }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Search Trends</CardTitle>
        <CardDescription>{keyword} · last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        {trend.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No trend data for this keyword.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fillVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-volume)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-volume)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="volume" type="monotone" stroke="var(--color-volume)" fill="url(#fillVolume)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
