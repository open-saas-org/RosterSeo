"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// Validated categorical palette (dataviz skill, references/palette.md) -
// fixed hue order (blue/orange/aqua/yellow/magenta/green), adjacent-pair
// colorblind-safe for line charts in both light and dark mode. Brand always
// takes slot 1; competitors fill the rest in a stable order.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

// One entity's real mention-rate line per prompt (brand + tracked
// competitors), all from the same real aiVisibilityResults rows. A legend
// is always shown (palette-relief requirement for the light-mode slots that
// sit under 3:1 contrast) so identity never depends on hue alone.
export function PromptTrendChart({
  data,
  entities,
}: {
  data: Array<Record<string, string | number>>;
  entities: Array<{ key: string; label: string }>;
}) {
  const chartConfig = Object.fromEntries(
    entities.map((e, i) => [e.key, { label: e.label, color: PALETTE[i % PALETTE.length] }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={32}
          fontSize={12}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {entities.map((e) => (
          <Line
            key={e.key}
            dataKey={e.key}
            type="monotone"
            stroke={`var(--color-${e.key})`}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            connectNulls
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}
