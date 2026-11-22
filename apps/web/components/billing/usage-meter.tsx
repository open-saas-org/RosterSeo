import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { USAGE_METRIC_LABELS, type UsageMetric } from "@/lib/plans";

export function UsageMeter({ metric, used, limit }: { metric: UsageMetric; used: number; limit: number }) {
  const label = USAGE_METRIC_LABELS[metric];

  // A limit of 0 means this feature simply isn't included in the current
  // plan (e.g. Free's site_audits) - not "0 used of a 0 cap," which would
  // read as an alarming always-maxed-out red bar for something the user
  // never tried to use. Show the honest "not included" state instead of a
  // progress bar at all.
  if (limit <= 0) {
    return (
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">Not included in your plan</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used} / {limit} this month
        </span>
      </div>
      <Progress value={pct}>
        <ProgressTrack>
          <ProgressIndicator className={pct >= 100 ? "bg-destructive" : undefined} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
