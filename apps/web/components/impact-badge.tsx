import { Badge } from "@/components/ui/badge";

export type Impact = "High" | "Medium" | "Low";

const variant: Record<Impact, "destructive" | "warning" | "success"> = {
  High: "destructive",
  Medium: "warning",
  Low: "success",
};

export function ImpactBadge({ impact }: { impact: Impact }) {
  return <Badge variant={variant[impact]}>{impact}</Badge>;
}
