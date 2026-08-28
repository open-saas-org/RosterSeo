"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// A donut is an "all-pairs" comparison (every slice is visually compared to
// every other slice at once), which the dataviz skill's validated palette
// only clears for its first 3 categorical slots - so this always shows at
// most 3 real colored slices (brand + top 2 competitors by current share)
// plus one neutral "Other" slice folding in everyone else, never more.
const SLICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const OTHER_COLOR = "var(--muted-foreground)";

export function ShareOfVoiceDonut({
  slices,
}: {
  slices: Array<{ key: string; label: string; value: number }>;
}) {
  const chartConfig = Object.fromEntries(
    slices.map((s, i) => [s.key, { label: s.label, color: i < 3 ? SLICE_COLORS[i] : OTHER_COLOR }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[140px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={slices} dataKey="value" nameKey="key" innerRadius={38} outerRadius={62} strokeWidth={2} stroke="var(--card)">
          {slices.map((s, i) => (
            <Cell key={s.key} fill={i < 3 ? SLICE_COLORS[i] : OTHER_COLOR} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
