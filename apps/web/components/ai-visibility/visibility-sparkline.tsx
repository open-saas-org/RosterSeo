"use client";

import { Line, LineChart } from "recharts";

// A small decorative trend glance for the summary banner - real data (the
// same day-grouped rollup the full trend charts use), just rendered at a
// fixed small size with no axes. Reads `--chart-1` directly (a real,
// globally-defined CSS var) rather than going through ChartContainer's
// per-key `--color-X` indirection, which a fixed-size decorative element
// like this doesn't need.
export function VisibilitySparkline({
  data,
  dataKey,
  color = "var(--chart-1)",
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  color?: string;
}) {
  if (data.length < 2) return null;
  return (
    <LineChart width={140} height={36} data={data}>
      <Line dataKey={dataKey} type="monotone" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}
