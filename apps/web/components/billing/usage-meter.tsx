import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

const METRIC_LABELS: Record<string, string> = {
  page_analyzer_reports: "Page Analyzer reports",
  tracked_keywords: "Tracked keywords",
  site_audits: "Site audits",
  ai_visibility_prompts: "AI Visibility prompts",
  connected_accounts: "Connected Publish/Social accounts",
};

export function UsageMeter({ metric, used, limit }: { metric: string; used: number; limit: number }) {
  const label = METRIC_LABELS[metric] ?? metric;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

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
