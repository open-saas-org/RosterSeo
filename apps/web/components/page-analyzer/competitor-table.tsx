"use client";

import { ExternalLink } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import type { CompetitorComparisonRow, CompetitorStrengthTier } from "@/components/page-analyzer/analysis";

const columnHelper = createDataTableColumns<CompetitorComparisonRow>();

const STRENGTH_TIER_META: Record<CompetitorStrengthTier, { label: string; variant: VariantProps<typeof badgeVariants>["variant"] }> = {
  smaller: { label: "Smaller — easy target", variant: "success" },
  similar: { label: "Similar size — realistic", variant: "info" },
  bigger: { label: "Bigger — long-term", variant: "warning" },
  "much-bigger": { label: "Much bigger — unlikely soon", variant: "destructive" },
  unknown: { label: "Not sized", variant: "outline" },
};

// Real-outcome priority for the default sort - the whole point of sizing
// competitors is putting the beatable ones where the user actually looks
// first, not buried at SERP position order.
const TIER_SORT_ORDER: Record<CompetitorStrengthTier, number> = {
  smaller: 0,
  similar: 1,
  bigger: 2,
  "much-bigger": 3,
  unknown: 4,
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

const columns: DataTableColumnDef<CompetitorComparisonRow>[] = [
  columnHelper.accessor("position", {
    header: "SERP #",
    cell: (ctx) => {
      const row = ctx.row.original;
      if (row.isTarget) {
        return row.position !== null ? (
          <Badge variant="success">Your page · #{row.position}</Badge>
        ) : (
          <Badge variant="secondary">Your page</Badge>
        );
      }
      return <span className="tabular-nums text-muted-foreground">#{row.position}</span>;
    },
  }),
  columnHelper.accessor("domain", {
    header: "Page",
    sortFn: "text",
    cell: (ctx) => {
      const row = ctx.row.original;
      return (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-xs items-center gap-1 truncate hover:underline"
          title={row.url}
        >
          <span className="truncate">{row.domain}</span>
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
        </a>
      );
    },
  }),
  {
    id: "strengthTier",
    header: "How beatable",
    cell: (ctx) => {
      const row = ctx.row.original;
      if (row.isTarget) return <span className="text-muted-foreground">—</span>;
      const meta = STRENGTH_TIER_META[row.strengthTier ?? "unknown"];
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
  },
  {
    id: "domainRating",
    header: "Domain rating",
    cell: (ctx) => {
      const row = ctx.row.original;
      return row.domainRating !== undefined ? <span className="tabular-nums">{row.domainRating}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    id: "estimatedMonthlyTraffic",
    header: "Est. traffic",
    cell: (ctx) => {
      const row = ctx.row.original;
      return row.estimatedMonthlyTraffic !== undefined ? (
        <span className="tabular-nums">{formatCompact(row.estimatedMonthlyTraffic)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  columnHelper.accessor("wordCount", {
    header: "Words",
    sortFn: "alphanumeric",
    cell: (ctx) => <span className="tabular-nums">{ctx.getValue().toLocaleString()}</span>,
  }),
  columnHelper.accessor("h1Count", {
    header: "H1s",
    sortFn: "alphanumeric",
    cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
  }),
  columnHelper.accessor("imagesMissingAlt", {
    header: "Missing alt",
    sortFn: "alphanumeric",
    cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
  }),
  columnHelper.accessor("loadTimeMs", {
    header: "Load time",
    sortFn: "alphanumeric",
    cell: (ctx) => <span className="tabular-nums">{ctx.getValue().toLocaleString()}ms</span>,
  }),
];

export function CompetitorTable({ rows, targetKeyword }: { rows: CompetitorComparisonRow[]; targetKeyword: string }) {
  const hasRealCompetitors = rows.some((r) => !r.isTarget);
  const hasSizing = rows.some((r) => !r.isTarget && r.strengthTier && r.strengthTier !== "unknown");

  // Target always first (it's the reference point), then competitors
  // ordered by how beatable they are, SERP position as the tiebreaker
  // within a tier - not left in raw SERP-position order.
  const sortedRows = [...rows].sort((a, b) => {
    if (a.isTarget) return -1;
    if (b.isTarget) return 1;
    const tierDiff = TIER_SORT_ORDER[a.strengthTier ?? "unknown"] - TIER_SORT_ORDER[b.strengthTier ?? "unknown"];
    if (tierDiff !== 0) return tierDiff;
    return (a.position ?? 999) - (b.position ?? 999);
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Your page vs. the top 10 SERP</CardTitle>
        <CardDescription>
          On-page signals and real domain-authority sizing for your page vs. every real page currently ranking for &ldquo;{targetKeyword}&rdquo;.
        </CardDescription>
        {hasSizing ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">How beatable:</span>
            {(["smaller", "similar", "bigger", "much-bigger"] as const).map((tier) => (
              <Badge key={tier} variant={STRENGTH_TIER_META[tier].variant} className="text-xs">
                {STRENGTH_TIER_META[tier].label}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {!hasRealCompetitors ? (
          <p className="p-4 text-sm text-muted-foreground">
            No real SERP data available for this run - DataForSEO was unconfigured or the real call failed, so no competitor
            comparison could be built. Nothing below is fabricated.
          </p>
        ) : null}
        <DataTable columns={columns} data={sortedRows} pageSize={11} emptyMessage="No comparison data." bordered={false} />
      </CardContent>
    </Card>
  );
}
