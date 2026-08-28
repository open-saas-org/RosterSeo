// Summary-metric helper for Merchant Insights - same period-over-period
// half-split approach as gsc-insights-metrics.ts's summarizeSearchConsoleRows,
// over MerchantPerformanceRow[] instead.

import type { MerchantPerformanceRow } from "@seo-tool/google";

export interface MerchantInsightsMetrics {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  totalConversions: number;
  clicksDeltaLabel: string;
  impressionsDeltaLabel: string;
  ctrDeltaLabel: string;
  conversionsDeltaLabel: string;
  clicksTrend: "up" | "down";
  impressionsTrend: "up" | "down";
  ctrTrend: "up" | "down";
  conversionsTrend: "up" | "down";
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function sumBy(rows: MerchantPerformanceRow[], key: "clicks" | "impressions" | "conversions"): number {
  return rows.reduce((acc, row) => acc + row[key], 0);
}

export function summarizeMerchantRows(rows: MerchantPerformanceRow[]): MerchantInsightsMetrics {
  const mid = Math.floor(rows.length / 2);
  const prevRows = rows.slice(0, mid);
  const currRows = rows.slice(mid);
  const windowDays = currRows.length;

  const totalClicks = sumBy(rows, "clicks");
  const totalImpressions = sumBy(rows, "impressions");
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const totalConversions = sumBy(rows, "conversions");

  const clicksChange = pctChange(sumBy(currRows, "clicks"), sumBy(prevRows, "clicks"));
  const impressionsChange = pctChange(sumBy(currRows, "impressions"), sumBy(prevRows, "impressions"));
  const currCtr = sumBy(currRows, "impressions") > 0 ? sumBy(currRows, "clicks") / sumBy(currRows, "impressions") : 0;
  const prevCtr = sumBy(prevRows, "impressions") > 0 ? sumBy(prevRows, "clicks") / sumBy(prevRows, "impressions") : 0;
  const ctrChange = pctChange(currCtr, prevCtr);
  const conversionsChange = pctChange(sumBy(currRows, "conversions"), sumBy(prevRows, "conversions"));

  return {
    totalClicks,
    totalImpressions,
    avgCtr,
    totalConversions,
    clicksDeltaLabel: `${clicksChange >= 0 ? "+" : ""}${clicksChange.toFixed(0)}% vs prior ${windowDays}d`,
    impressionsDeltaLabel: `${impressionsChange >= 0 ? "+" : ""}${impressionsChange.toFixed(0)}% vs prior ${windowDays}d`,
    ctrDeltaLabel: `${ctrChange >= 0 ? "+" : ""}${ctrChange.toFixed(1)}% vs prior ${windowDays}d`,
    conversionsDeltaLabel: `${conversionsChange >= 0 ? "+" : ""}${conversionsChange.toFixed(0)}% vs prior ${windowDays}d`,
    clicksTrend: clicksChange >= 0 ? "up" : "down",
    impressionsTrend: impressionsChange >= 0 ? "up" : "down",
    ctrTrend: ctrChange >= 0 ? "up" : "down",
    conversionsTrend: conversionsChange >= 0 ? "up" : "down",
  };
}
