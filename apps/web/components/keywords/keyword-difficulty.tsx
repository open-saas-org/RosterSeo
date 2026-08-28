import { cn } from "@/lib/utils";

// Computed difficulty score (PRD 5.2) rendered as a small labeled meter
// rather than a bare number, so "42" reads as "Medium" at a glance.
function difficultyBand(score: number): { label: string; className: string } {
  if (score < 30) return { label: "Easy", className: "bg-success" };
  if (score < 60) return { label: "Medium", className: "bg-warning" };
  return { label: "Hard", className: "bg-destructive" };
}

export function KeywordDifficulty({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" />
        <span className="w-8 tabular-nums text-muted-foreground">—</span>
      </div>
    );
  }
  const band = difficultyBand(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", band.className)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
