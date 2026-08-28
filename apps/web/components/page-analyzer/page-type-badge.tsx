import { House, ShoppingBag, LayoutGrid, FileText, File, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PageType, PageTypeSignal } from "@seo-tool/crawler";

const PAGE_TYPE_META: Record<PageType, { label: string; icon: LucideIcon }> = {
  homepage: { label: "Homepage", icon: House },
  product: { label: "Product page", icon: ShoppingBag },
  category: { label: "Category page", icon: LayoutGrid },
  article: { label: "Article", icon: FileText },
  standard: { label: "Standard page", icon: File },
};

// Real, rule-based detection (detectPageType, @seo-tool/crawler) - the
// tooltip surfaces exactly which real signal decided it (JSON-LD/URL/
// content), so this never reads as an unexplained AI guess.
export function PageTypeBadge({ signal }: { signal: PageTypeSignal }) {
  const meta = PAGE_TYPE_META[signal.type];
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" className="gap-1">
            <Icon className="size-3" />
            {meta.label}
          </Badge>
        }
      />
      <TooltipContent>
        {signal.confidence} confidence — {signal.reasons.join("; ")}
      </TooltipContent>
    </Tooltip>
  );
}
