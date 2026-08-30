// Summary-metric helper for the GSC Insights page and Dashboard. Consumes
// the real SearchConsoleRow[] returned by getSearchConsolePerformance() -
// pure aggregation math over real rows, reused wherever GSC data needs a
// clicks/impressions/CTR/position summary with period-over-period deltas.

import type { SearchConsoleRow } from "@rosterseo/google";

export interface GscInsightsMetrics {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  clicksDeltaLabel: string;
  impressionsDeltaLabel: string;
  ctrDeltaLabel: string;
  positionDeltaLabel: string;
  clicksTrend: "up" | "down";
  impressionsTrend: "up" | "down";
  ctrTrend: "up" | "down";
  positionTrend: "up" | "down";
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function sumBy(rows: SearchConsoleRow[], key: "clicks" | "impressions"): number {
  return rows.reduce((acc, row) => acc + row[key], 0);
}

function avgBy(rows: SearchConsoleRow[], key: "ctr" | "position"): number {
  return rows.length ? rows.reduce((acc, row) => acc + row[key], 0) / rows.length : 0;
}

/** Splits the window in half and compares halves - same idea as the dashboard's "vs last 30d" deltas, just computed from the rows we have instead of a separate prior-period fetch. */
export function summarizeSearchConsoleRows(rows: SearchConsoleRow[]): GscInsightsMetrics {
  const mid = Math.floor(rows.length / 2);
  const prevRows = rows.slice(0, mid);
  const currRows = rows.slice(mid);
  const windowDays = currRows.length;

  const totalClicks = sumBy(rows, "clicks");
  const totalImpressions = sumBy(rows, "impressions");
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition = avgBy(rows, "position");

  const clicksChange = pctChange(sumBy(currRows, "clicks"), sumBy(prevRows, "clicks"));
  const impressionsChange = pctChange(sumBy(currRows, "impressions"), sumBy(prevRows, "impressions"));
  const ctrChange = pctChange(avgBy(currRows, "ctr"), avgBy(prevRows, "ctr"));
  const positionChange = avgBy(currRows, "position") - avgBy(prevRows, "position"); // negative = improved (lower is better)

  return {
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    clicksDeltaLabel: `${clicksChange >= 0 ? "+" : ""}${clicksChange.toFixed(0)}% vs prior ${windowDays}d`,
    impressionsDeltaLabel: `${impressionsChange >= 0 ? "+" : ""}${impressionsChange.toFixed(0)}% vs prior ${windowDays}d`,
    ctrDeltaLabel: `${ctrChange >= 0 ? "+" : ""}${ctrChange.toFixed(1)}% vs prior ${windowDays}d`,
    positionDeltaLabel: `${positionChange >= 0 ? "+" : ""}${positionChange.toFixed(1)} vs prior ${windowDays}d`,
    clicksTrend: clicksChange >= 0 ? "up" : "down",
    impressionsTrend: impressionsChange >= 0 ? "up" : "down",
    ctrTrend: ctrChange >= 0 ? "up" : "down",
    positionTrend: positionChange <= 0 ? "up" : "down",
  };
}
