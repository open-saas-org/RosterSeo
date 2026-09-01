import { cn } from "@/lib/utils";

// Ring fills clockwise from 12 o'clock - a plain "n / limit" text pairing
// would say the same thing but not let you read "getting close" from a
// glance across several selected platforms at once the way the fill does.
export function SocialCharCounter({ length, limit, className }: { length: number; limit?: number; className?: string }) {
  if (!limit) {
    // Platforms with no practical limit (Facebook Pages) - a plain count,
    // no ring, since there's nothing to be "close to".
    return <span className={cn("text-xs text-muted-foreground", className)}>{length} characters</span>;
  }

  const ratio = Math.min(length / limit, 1);
  const over = length > limit;
  const remaining = limit - length;
  const circumference = 2 * Math.PI * 8;
  const color = over ? "var(--color-destructive)" : ratio > 0.9 ? "var(--color-warning)" : "var(--color-primary)";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90 shrink-0">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-border)" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className={cn("text-xs tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
        {over ? `${Math.abs(remaining)} over` : `${length} / ${limit}`}
      </span>
    </div>
  );
}
