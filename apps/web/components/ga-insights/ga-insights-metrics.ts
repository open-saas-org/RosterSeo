// Summary-metric helper for the GA Insights page, same half-window
// period-over-period technique apps/web/components/gsc-insights/gsc-insights-metrics.ts's
// summarizeSearchConsoleRows() uses - not shared with it since GSC and GA4
// rows have different fields (this codebase prefers small purpose-specific
// helpers over a premature shared abstraction for two unrelated shapes).

import type { GA4OrganicTrendRow } from "@rosterseo/google";

export interface GaInsightsMetrics {
  totalSessions: number;
  engagementRate: number; // 0-1, engagedSessions / sessions
  avgSessionDuration: number; // seconds
  totalConversions: number;
  sessionsDeltaLabel: string;
  engagementDeltaLabel: string;
  durationDeltaLabel: string;
  conversionsDeltaLabel: string;
  sessionsTrend: "up" | "down";
  engagementTrend: "up" | "down";
  durationTrend: "up" | "down";
  conversionsTrend: "up" | "down";
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function sumBy(rows: GA4OrganicTrendRow[], key: "sessions" | "engagedSessions" | "conversions"): number {
  return rows.reduce((acc, row) => acc + row[key], 0);
}

function avgDuration(rows: GA4OrganicTrendRow[]): number {
  return rows.length ? rows.reduce((acc, row) => acc + row.averageSessionDuration, 0) / rows.length : 0;
}

export function summarizeGaOrganicTrend(rows: GA4OrganicTrendRow[]): GaInsightsMetrics {
  const mid = Math.floor(rows.length / 2);
  const prevRows = rows.slice(0, mid);
  const currRows = rows.slice(mid);
  const windowDays = currRows.length;

  const totalSessions = sumBy(rows, "sessions");
  const totalEngaged = sumBy(rows, "engagedSessions");
  const engagementRate = totalSessions > 0 ? totalEngaged / totalSessions : 0;
  const avgSessionDuration = avgDuration(rows);
  const totalConversions = sumBy(rows, "conversions");

  const sessionsChange = pctChange(sumBy(currRows, "sessions"), sumBy(prevRows, "sessions"));
  const currEngagementRate = sumBy(currRows, "sessions") > 0 ? sumBy(currRows, "engagedSessions") / sumBy(currRows, "sessions") : 0;
  const prevEngagementRate = sumBy(prevRows, "sessions") > 0 ? sumBy(prevRows, "engagedSessions") / sumBy(prevRows, "sessions") : 0;
  const engagementChange = pctChange(currEngagementRate, prevEngagementRate);
  const durationChange = pctChange(avgDuration(currRows), avgDuration(prevRows));
  const conversionsChange = pctChange(sumBy(currRows, "conversions"), sumBy(prevRows, "conversions"));

  return {
    totalSessions,
    engagementRate,
    avgSessionDuration,
    totalConversions,
    sessionsDeltaLabel: `${sessionsChange >= 0 ? "+" : ""}${sessionsChange.toFixed(0)}% vs prior ${windowDays}d`,
    engagementDeltaLabel: `${engagementChange >= 0 ? "+" : ""}${engagementChange.toFixed(0)}% vs prior ${windowDays}d`,
    durationDeltaLabel: `${durationChange >= 0 ? "+" : ""}${durationChange.toFixed(0)}% vs prior ${windowDays}d`,
    conversionsDeltaLabel: `${conversionsChange >= 0 ? "+" : ""}${conversionsChange.toFixed(0)}% vs prior ${windowDays}d`,
    sessionsTrend: sessionsChange >= 0 ? "up" : "down",
    engagementTrend: engagementChange >= 0 ? "up" : "down",
    durationTrend: durationChange >= 0 ? "up" : "down",
    conversionsTrend: conversionsChange >= 0 ? "up" : "down",
  };
}
