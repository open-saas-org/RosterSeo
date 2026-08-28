import { ShoppingBag, Star, MousePointerClick, Eye, Percent, TrendingUp, Plug } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductJsonLd } from "@seo-tool/crawler";
import type { CompetitorComparisonRow, PageAnalyzerMerchantMetrics } from "@/components/page-analyzer/analysis";

const MAX_COMPETITOR_COLUMNS = 3;

function formatPrice(product: ProductJsonLd): string | null {
  if (product.price === null) return null;
  return `${product.priceCurrency ?? ""} ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function formatRating(product: ProductJsonLd): string | null {
  if (product.ratingValue === null) return null;
  return `${product.ratingValue.toFixed(1)}★${product.reviewCount !== null ? ` (${product.reviewCount.toLocaleString()})` : ""}`;
}

type Column = { label: string; product: ProductJsonLd };

// Real on-page schema.org Product data (parsed at crawl time, works for the
// target AND every SERP competitor - see analysis.ts/fetch-and-parse.ts),
// plus real Merchant Center performance when the target page is the
// project's own product and Merchant Center is connected. Only rendered
// when the report's own detected page type is "product" - never shown, or
// padded with an empty grid, for a page whose markup doesn't declare a
// product at all.
export function ProductSnapshot({
  comparisonRows,
  merchantMetrics,
}: {
  comparisonRows: CompetitorComparisonRow[];
  merchantMetrics?: PageAnalyzerMerchantMetrics;
}) {
  const target = comparisonRows.find((row) => row.isTarget);
  const targetProduct = target?.jsonLdProduct;

  const competitorColumns: Column[] = comparisonRows
    .filter((row) => !row.isTarget && row.jsonLdProduct)
    .slice(0, MAX_COMPETITOR_COLUMNS)
    .map((row) => ({ label: row.domain, product: row.jsonLdProduct! }));

  const columns: Column[] = [
    ...(targetProduct ? [{ label: "You", product: targetProduct }] : []),
    ...competitorColumns,
  ];

  if (columns.length === 0) return null;

  const merchantStatus = merchantMetrics?.status ?? "not_connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="size-4 text-seo" />
          Product snapshot
        </CardTitle>
        <CardDescription>Real price, rating, and stock data pulled from each page&apos;s own product markup.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Field</th>
                {columns.map((col) => (
                  <th key={col.label} className="px-3 py-2 text-left font-medium">
                    {col.label === "You" ? <Badge variant="seo">You</Badge> : <span className="truncate">{col.label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 text-muted-foreground">Product</td>
                {columns.map((col) => (
                  <td key={col.label} className="max-w-[200px] truncate px-3 py-2">
                    {col.product.name ?? "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 text-muted-foreground">Price</td>
                {columns.map((col) => (
                  <td key={col.label} className="px-3 py-2 tabular-nums">
                    {formatPrice(col.product) ?? "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 text-muted-foreground">Rating</td>
                {columns.map((col) => (
                  <td key={col.label} className="px-3 py-2 tabular-nums">
                    {formatRating(col.product) ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 fill-warning text-warning" />
                        {formatRating(col.product)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 text-muted-foreground">Availability</td>
                {columns.map((col) => (
                  <td key={col.label} className="px-3 py-2">
                    {col.product.availability ?? "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2 text-muted-foreground">Brand</td>
                {columns.map((col) => (
                  <td key={col.label} className="px-3 py-2">
                    {col.product.brand ?? "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {merchantStatus === "connected" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Real Merchant Center performance (last 28 days)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard label="Clicks" value={(merchantMetrics?.totalClicks ?? 0).toLocaleString()} icon={MousePointerClick} />
              <MetricCard label="Impressions" value={(merchantMetrics?.totalImpressions ?? 0).toLocaleString()} icon={Eye} />
              <MetricCard label="CTR" value={`${((merchantMetrics?.avgCtr ?? 0) * 100).toFixed(1)}%`} icon={Percent} />
              <MetricCard label="Conversions" value={(merchantMetrics?.totalConversions ?? 0).toLocaleString()} icon={TrendingUp} />
            </div>
          </div>
        ) : merchantStatus === "not_connected" && targetProduct ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            <span>Connect Merchant Center to see this product&apos;s real Shopping clicks/impressions here.</span>
            <Link href="/integrations" className={cn(buttonVariants({ size: "xs", variant: "outline" }), "ml-auto gap-1 shrink-0")}>
              <Plug className="size-3" />
              Connect
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
