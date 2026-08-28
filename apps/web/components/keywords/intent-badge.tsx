import { Badge } from "@/components/ui/badge";

const INTENT_STYLES: Record<string, string> = {
  transactional: "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15",
  commercial: "bg-amber-500/15 text-amber-500 hover:bg-amber-500/15",
  informational: "bg-blue-500/15 text-blue-500 hover:bg-blue-500/15",
  navigational: "bg-violet-500/15 text-violet-500 hover:bg-violet-500/15",
};

const INTENT_LABELS: Record<string, string> = {
  transactional: "Trans",
  commercial: "Comm",
  informational: "Info",
  navigational: "Nav",
};

export function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent || !INTENT_STYLES[intent]) return <span className="text-muted-foreground">—</span>;
  return <Badge className={INTENT_STYLES[intent]}>{INTENT_LABELS[intent]}</Badge>;
}
