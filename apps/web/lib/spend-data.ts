import { gte, sql } from "drizzle-orm";
import { db, providerSpendLog } from "@rosterseo/db";

const TREND_WINDOW_DAYS = 30;

export type SpendByProvider = {
  provider: string;
  totalUsd: number;
  callCount: number;
  hasEstimate: boolean;
  hasReal: boolean;
};

export type SpendRecentRow = {
  provider: string;
  operation: string;
  model: string | null;
  costUsd: number;
  isEstimate: boolean;
  createdAt: Date;
};

export type SpendSummary = {
  totalAllTimeUsd: number;
  totalLast30dUsd: number;
  byProvider: SpendByProvider[];
  daily: Array<{ date: string; byProvider: Record<string, number> }>;
  recent: SpendRecentRow[];
};

// Shared by the Spend page's server component (initial render) and
// /api/spend (client-side refresh) so the two never drift into computing
// totals differently.
export async function getSpendSummary(): Promise<SpendSummary> {
  const byProvider = await db
    .select({
      provider: providerSpendLog.provider,
      totalUsd: sql<number>`sum(${providerSpendLog.costUsd})`,
      callCount: sql<number>`count(*)`,
      hasEstimate: sql<boolean>`bool_or(${providerSpendLog.isEstimate})`,
      hasReal: sql<boolean>`bool_or(not ${providerSpendLog.isEstimate})`,
    })
    .from(providerSpendLog)
    .groupBy(providerSpendLog.provider);

  const windowStart = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const recentRows = await db
    .select({
      provider: providerSpendLog.provider,
      operation: providerSpendLog.operation,
      model: providerSpendLog.model,
      costUsd: providerSpendLog.costUsd,
      isEstimate: providerSpendLog.isEstimate,
      createdAt: providerSpendLog.createdAt,
    })
    .from(providerSpendLog)
    .where(gte(providerSpendLog.createdAt, windowStart))
    .orderBy(sql`${providerSpendLog.createdAt} desc`);

  const dailyMap = new Map<string, Map<string, number>>();
  for (const row of recentRows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const byProviderForDate = dailyMap.get(date) ?? new Map<string, number>();
    byProviderForDate.set(row.provider, (byProviderForDate.get(row.provider) ?? 0) + row.costUsd);
    dailyMap.set(date, byProviderForDate);
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, byProviderForDate]) => ({ date, byProvider: Object.fromEntries(byProviderForDate) }));

  const totalAllTimeUsd = byProvider.reduce((sum, p) => sum + p.totalUsd, 0);
  const totalLast30dUsd = recentRows.reduce((sum, r) => sum + r.costUsd, 0);

  return { totalAllTimeUsd, totalLast30dUsd, byProvider, daily, recent: recentRows.slice(0, 50) };
}
