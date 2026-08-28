// Real query/page/striking-distance views, all derived from ONE real GSC
// fetch dimensioned by [query, page] (getSearchConsoleQueryPageBreakdown) -
// GSC's own UI computes these the same way rather than three separate API
// calls. Position is aggregated as an impressions-weighted average, which
// is how GSC itself rolls a query's position up across pages when you
// query it single-dimensioned - a plain average would understate how much
// a low-impression outlier page skews the number.

import type { SearchConsoleRow } from "@seo-tool/google";

export interface QueryAggregateRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageAggregateRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function aggregate<K extends string>(rows: SearchConsoleRow[], keyOf: (row: SearchConsoleRow) => K): Map<K, { clicks: number; impressions: number; positionWeighted: number }> {
  const map = new Map<K, { clicks: number; impressions: number; positionWeighted: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = map.get(key) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.positionWeighted += row.position * row.impressions;
    map.set(key, existing);
  }
  return map;
}

export function aggregateByQuery(rows: SearchConsoleRow[]): QueryAggregateRow[] {
  const map = aggregate(rows, (r) => r.query ?? "");
  return [...map.entries()].map(([query, v]) => ({
    query,
    clicks: v.clicks,
    impressions: v.impressions,
    ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    position: v.impressions > 0 ? v.positionWeighted / v.impressions : 0,
  }));
}

export function aggregateByPage(rows: SearchConsoleRow[]): PageAggregateRow[] {
  const map = aggregate(rows, (r) => r.page ?? "");
  return [...map.entries()].map(([page, v]) => ({
    page,
    clicks: v.clicks,
    impressions: v.impressions,
    ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    position: v.impressions > 0 ? v.positionWeighted / v.impressions : 0,
  }));
}

// Real (query, page) pairs ranking 5-20 - just outside the top results,
// worth improving to move into them. Sorted by impressions (highest
// opportunity first), same as GSC's own "queries near the top" framing.
export function strikingDistanceRows(rows: SearchConsoleRow[]): SearchConsoleRow[] {
  return rows.filter((r) => r.position >= 5 && r.position <= 20).sort((a, b) => b.impressions - a.impressions);
}
