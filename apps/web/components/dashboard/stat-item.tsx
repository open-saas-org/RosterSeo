import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Compact label/value/delta stat, used inside each dashboard block card's
// 2x2 grid - distinct from MetricCard (which renders its own bordered
// Card), since these live several to a card instead of one per card.
export function StatItem({
  label,
  value,
  deltaLabel,
  trend,
}: {
  label: string;
  value: ReactNode;
  deltaLabel?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {deltaLabel ? (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs",
              trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {trend === "up" ? <ArrowUpRight className="size-3.5" /> : trend === "down" ? <ArrowDownRight className="size-3.5" /> : null}
            {deltaLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
