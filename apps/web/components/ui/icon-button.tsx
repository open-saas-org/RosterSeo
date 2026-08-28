import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// A tooltip-wrapped icon-only button in one call, instead of hand-composing
// Tooltip/TooltipTrigger/TooltipContent + Button + sr-only text at every
// call site - every icon-only action (delete, refresh, copy, paginate)
// should use this so hover intent is always communicated, not just aria.
export function IconButton({
  icon: Icon,
  label,
  size = "icon-sm",
  variant = "ghost",
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  icon: LucideIcon;
  label: string;
  size?: "icon" | "icon-sm" | "icon-xs" | "icon-lg";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant={variant} size={size} className={className} {...props}>
            <Icon />
            <span className="sr-only">{label}</span>
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
