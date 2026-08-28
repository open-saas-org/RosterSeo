"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  top3: { label: "Top 3", color: "var(--chart-1)" },
  top4to10: { label: "4-10", color: "var(--chart-2)" },
  top11to20: { label: "11-20", color: "var(--chart-3)" },
  notRanking: { label: "Not in top 20", color: "var(--chart-5)" },
} satisfies ChartConfig;

type TrendPoint = {
  runId: string;
  startedAt: string;
  top3: number;
  top4to10: number;
  top11to20: number;
  notRanking: number;
};

const RANGE_OPTIONS = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All time" },
] as const;

// Stacked position-distribution chart, the reference screenshot's headline
// visual - one point per completed Fetch Rankings run (never a raw
// timestamp axis, since runs happen on-demand not on a fixed cadence).
export function RankTrackingPositionChart({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["value"]>("90");

  const { data, isLoading } = useQuery({
    queryKey: ["rank-trend", projectId, range],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rank-tracking/trend?days=${range}`);
      if (!res.ok) throw new Error("Failed to fetch trend");
      return res.json() as Promise<{ points: TrendPoint[] }>;
    },
  });

  const points = data?.points ?? [];
  const chartData = points.map((p) => ({
    ...p,
    date: new Date(p.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Position distribution</CardTitle>
          <CardDescription>Tracked keywords by ranking bucket, one point per Fetch Rankings run.</CardDescription>
        </div>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={range === opt.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>No rank checks yet.</p>
            <p>Run Fetch Rankings to start the trend.</p>
          </div>
        ) : chartData.length < 2 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>Only 1 check so far.</p>
            <p>The trend fills in after the next check.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <defs>
                {Object.keys(chartConfig).map((key) => (
                  <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="top3"
                type="monotone"
                stackId="1"
                stroke="var(--color-top3)"
                fill="url(#fill-top3)"
                strokeWidth={1.5}
              />
              <Area
                dataKey="top4to10"
                type="monotone"
                stackId="1"
                stroke="var(--color-top4to10)"
                fill="url(#fill-top4to10)"
                strokeWidth={1.5}
              />
              <Area
                dataKey="top11to20"
                type="monotone"
                stackId="1"
                stroke="var(--color-top11to20)"
                fill="url(#fill-top11to20)"
                strokeWidth={1.5}
              />
              <Area
                dataKey="notRanking"
                type="monotone"
                stackId="1"
                stroke="var(--color-notRanking)"
                fill="url(#fill-notRanking)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
