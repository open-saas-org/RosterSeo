import { Badge } from "@/components/ui/badge";
import type { Sentiment } from "@rosterseo/ai-visibility";

const VARIANT: Record<Sentiment, "default" | "secondary" | "destructive"> = {
  positive: "default",
  neutral: "secondary",
  negative: "destructive",
};

const LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return <Badge variant={VARIANT[sentiment]}>{LABEL[sentiment]}</Badge>;
}
