import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

// Extracted from the old TrackedKeywordsPanel (deleted alongside the Rank
// Tracking rebuild) so both the new RankTrackingTable and any future
// keyword-position UI can share it. Takes the current/previous position
// directly rather than a full history array, matching the new
// TrackedKeyword shape (only the latest two rank-check snapshots are kept
// client-side, not the whole history).
export function PositionDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null) return <span className="text-muted-foreground">—</span>;
  if (previous === null) {
    return <span className="tabular-nums font-medium">{current}</span>;
  }
  const delta = previous - current; // positive = improved (moved up)
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : ArrowRight;
  const color = delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <span className="tabular-nums font-medium">{current}</span>
      <span className={`flex items-center text-xs ${color}`}>
        <Icon className="size-3" />
        {delta !== 0 ? Math.abs(delta) : null}
      </span>
    </div>
  );
}
