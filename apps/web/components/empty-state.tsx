import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyStateGraphic, type EmptyStateGraphicVariant } from "@/components/empty-state-graphics";

export function EmptyState({
  icon: Icon,
  graphic,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  graphic?: EmptyStateGraphicVariant;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        {graphic ? (
          <EmptyStateGraphic variant={graphic} />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="max-w-md">
          <p className="text-base font-medium">{title}</p>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
