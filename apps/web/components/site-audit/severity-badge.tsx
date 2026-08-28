import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IssueSeverity } from "@/components/site-audit/audit-engine";

const config: Record<IssueSeverity, { label: string; icon: typeof AlertTriangle; className: string }> = {
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    className: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    className: "border-transparent bg-warning/10 text-warning dark:bg-warning/20",
  },
  info: {
    label: "Info",
    icon: Info,
    className: "border-transparent bg-info/10 text-info dark:bg-info/20",
  },
};

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const { label, icon: Icon, className } = config[severity];
  return (
    <Badge variant="outline" className={cn(className)}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
