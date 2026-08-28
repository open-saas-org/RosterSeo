import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  suffix,
  deltaLabel,
  trend,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  // Optional: some metrics (e.g. a single audit snapshot with no prior run
  // to compare against) have no real comparison to show - omitting both
  // just renders the value with no delta row, rather than forcing a
  // fabricated trend arrow.
  deltaLabel?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  // Optional: tint this one card as the "hero" number of the page, echoing
  // the ai-visibility overview page's border/bg/text treatment. Opt-in and
  // rare by design - most metric grids should stay neutral.
  accent?: "primary" | "ai-accent";
}) {
  const isGood = trend === "up";

  return (
    <Card
      size="sm"
      className={cn(
        "h-full",
        accent === "primary" && "border-primary/20 bg-primary/5",
        accent === "ai-accent" && "border-ai-accent/20 bg-ai-accent/5",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-normal text-muted-foreground truncate">{label}</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                accent === "primary" && "text-primary",
                accent === "ai-accent" && "text-ai-accent",
              )}
            >
              {value}
              {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
            </span>
            {deltaLabel ? (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs",
                  trend ? (isGood ? "text-success" : "text-destructive") : "text-muted-foreground",
                )}
              >
                {trend ? isGood ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" /> : null}
                {deltaLabel}
              </span>
            ) : null}
          </div>
        </div>
        <Icon className={cn("size-4 shrink-0", accent ? (accent === "primary" ? "text-primary" : "text-ai-accent") : "text-muted-foreground")} />
      </CardContent>
    </Card>
  );
}
