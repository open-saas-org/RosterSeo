// Real citation aggregation: rollups, recent-changes diffing, content-gap
// detection, and daily category/page-type series - all pure functions over
// already-classified citation rows (see citation-classification.ts),
// modeled on Elmo's elmo-reference/apps/web/src/lib/citation-rollup.ts and
// elmo-reference/apps/web/src/server/citations.ts approach, reimplemented
// against our schema (one aiVisibilityResults row carries a citations[]
// array rather than Elmo's one-row-per-citation table).

import { type CitationCategory, type CitationPageType, isRedditDomain, extractSubreddit } from "./citation-classification";
import { fillLastValueCarriedForward, dailyDateRange, type RawDailyValues } from "./trend-smoothing";

export interface CitationRow {
  promptId: string;
  promptText: string;
  provider: string;
  model: string;
  date: string; // ISO yyyy-mm-dd
  url: string;
  normalizedUrl: string;
  title?: string;
  domain: string;
  citationIndex: number;
  category: CitationCategory;
  pageType: CitationPageType;
}

export interface UrlStat {
  normalizedUrl: string;
  url: string;
  title?: string;
  domain: string;
  category: CitationCategory;
  pageType: CitationPageType;
  count: number;
  avgPosition: number | null;
  promptCount: number;
  byPrompt: Array<{ promptId: string; promptText: string; count: number }>;
}

export interface DomainStat {
  domain: string;
  category: CitationCategory;
  title?: string;
  count: number;
  uniqueUrls: number;
  previousCount?: number;
  changePercent?: number | null;
}

const LIMITS = { topDomains: 100, topUrls: 200, recentChanges: 10, reddit: 50 };

export function rollUpCitationUrls(rows: CitationRow[]): UrlStat[] {
  const byUrl = new Map<
    string,
    { url: string; title?: string; domain: string; category: CitationCategory; pageType: CitationPageType; count: number; positionSum: number; positionCount: number; byPrompt: Map<string, { promptText: string; count: number }> }
  >();

  for (const row of rows) {
    const entry = byUrl.get(row.normalizedUrl) ?? {
      url: row.url,
      title: row.title,
      domain: row.domain,
      category: row.category,
      pageType: row.pageType,
      count: 0,
      positionSum: 0,
      positionCount: 0,
      byPrompt: new Map<string, { promptText: string; count: number }>(),
    };
    entry.count += 1;
    if (!entry.title && row.title) entry.title = row.title;
    if (typeof row.citationIndex === "number") {
      entry.positionSum += row.citationIndex;
      entry.positionCount += 1;
    }
    const p = entry.byPrompt.get(row.promptId) ?? { promptText: row.promptText, count: 0 };
    p.count += 1;
    entry.byPrompt.set(row.promptId, p);
    byUrl.set(row.normalizedUrl, entry);
  }

  return [...byUrl.entries()]
    .map(([normalizedUrl, e]) => ({
      normalizedUrl,
      url: e.url,
      title: e.title,
      domain: e.domain,
      category: e.category,
      pageType: e.pageType,
      count: e.count,
      avgPosition: e.positionCount > 0 ? Math.round((e.positionSum / e.positionCount) * 10) / 10 : null,
      promptCount: e.byPrompt.size,
      byPrompt: [...e.byPrompt.entries()]
        .map(([promptId, p]) => ({ promptId, promptText: p.promptText, count: p.count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

// A domain's category/title come from its single most-cited URL (not
// re-derived from the bare domain) - a domain that's mostly review articles
// should read as "editorial" even if the registrable domain alone would
// classify differently.
export function rollUpCitationDomains(urlStats: UrlStat[]): DomainStat[] {
  const byDomain = new Map<string, { category: CitationCategory; title?: string; topCount: number; count: number; uniqueUrls: number }>();
  for (const u of urlStats) {
    const entry = byDomain.get(u.domain) ?? { category: u.category, title: u.title, topCount: 0, count: 0, uniqueUrls: 0 };
    entry.count += u.count;
    entry.uniqueUrls += 1;
    if (u.count > entry.topCount) {
      entry.topCount = u.count;
      entry.category = u.category;
      entry.title = u.title;
    }
    byDomain.set(u.domain, entry);
  }
  return [...byDomain.entries()]
    .map(([domain, e]) => ({ domain, category: e.category, title: e.title, count: e.count, uniqueUrls: e.uniqueUrls }))
    .sort((a, b) => b.count - a.count);
}

export function tallyCitations(urlStats: UrlStat[]): { totalCitations: number; categoryCounts: Record<string, number> } {
  const categoryCounts: Record<string, number> = {};
  let totalCitations = 0;
  for (const u of urlStats) {
    totalCitations += u.count;
    categoryCounts[u.category] = (categoryCounts[u.category] ?? 0) + u.count;
  }
  return { totalCitations, categoryCounts };
}

// Largest-remainder rounding so each day's percentages sum to exactly 100.
function toRoundedPercentages(counts: Record<string, number>, keys: string[]): Record<string, number> {
  const total = keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  if (total === 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = keys.map((k) => ((counts[k] ?? 0) / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (let k = 0; k < remainder && k < order.length; k++) result[order[k]!.i] += 1;
  return Object.fromEntries(keys.map((k, i) => [k, result[i]]));
}

export interface DailySeriesResult {
  data: Array<Record<string, string | number>>;
  keys: string[];
}

// Real per-day category/page-type percentage breakdown, gap-filled with
// last-value-carried-forward (see trend-smoothing.ts) rather than a single
// day's raw count, so sparse/irregular run schedules don't produce a
// zero-then-spike sawtooth: a day with no real citations repeats the most
// recent real day's percentages instead of dropping to 0 for everything.
function buildDailySeries(rows: CitationRow[], days: number, keyOf: (row: CitationRow) => string, topKeys: string[]): DailySeriesResult {
  const range = dailyDateRange(days);
  const rowsByDate = new Map<string, CitationRow[]>();
  for (const row of rows) {
    const list = rowsByDate.get(row.date) ?? [];
    list.push(row);
    rowsByDate.set(row.date, list);
  }

  // Real per-day percentages, only for days with at least one real
  // citation - toRoundedPercentages always fills every topKey (0 included)
  // for a day it's given, so a real day never has a partially-missing key.
  const raw = new Map<string, RawDailyValues<string>>();
  for (const [date, list] of rowsByDate.entries()) {
    const counts: Record<string, number> = {};
    for (const row of list) {
      const key = topKeys.includes(keyOf(row)) ? keyOf(row) : "other";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    raw.set(date, toRoundedPercentages(counts, topKeys));
  }

  const data = fillLastValueCarriedForward(range, raw, topKeys) as DailySeriesResult["data"];
  return { data, keys: topKeys };
}

// Caps the stacked chart to the app's 6 validated chart colors (dataviz
// skill's all-pairs cap for adjacent forms) - brand/competitor always shown
// when present (most meaningful for an AI-visibility context), the
// remaining slots go to whichever real categories have the most volume,
// everything else folds into "other".
export function buildCategorySeries(rows: CitationRow[], days: number): DailySeriesResult {
  const priority: CitationCategory[] = ["brand", "competitor", "editorial", "social", "ecommerce", "reviews"];
  const counts = new Map<CitationCategory, number>();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  const present = priority.filter((c) => (counts.get(c) ?? 0) > 0);
  const topKeys = [...present, "other"];
  return buildDailySeries(rows, days, (r) => r.category, topKeys);
}

export function buildPageTypeSeries(rows: CitationRow[], days: number): DailySeriesResult {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.pageType, (counts.get(row.pageType) ?? 0) + 1);
  const topKeys = [...counts.entries()]
    .filter(([k]) => k !== "other")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
  topKeys.push("other");
  return buildDailySeries(rows, days, (r) => r.pageType, topKeys);
}

export interface RecentChangeUrl {
  url: string;
  title?: string;
  domain: string;
  count: number;
  previousCount: number;
  promptCount: number;
}
export interface TitleChange {
  url: string;
  domain: string;
  previousTitle: string;
  currentTitle: string;
}
export interface RecentChangeDomain {
  domain: string;
  category: CitationCategory;
  count: number;
  previousCount: number;
}
export interface RecentChanges {
  newPages: RecentChangeUrl[];
  droppedPages: RecentChangeUrl[];
  titleChanges: TitleChange[];
  newDomains: RecentChangeDomain[];
  droppedDomains: RecentChangeDomain[];
}

const MIN_COUNT_FOR_CHANGE = 2;

export function buildRecentChanges(current: UrlStat[], previous: UrlStat[]): RecentChanges {
  const prevByUrl = new Map(previous.map((u) => [u.normalizedUrl, u]));
  const currByUrl = new Map(current.map((u) => [u.normalizedUrl, u]));

  const newPages: RecentChangeUrl[] = current
    .filter((u) => !prevByUrl.has(u.normalizedUrl) && u.count >= MIN_COUNT_FOR_CHANGE)
    .map((u) => ({ url: u.url, title: u.title, domain: u.domain, count: u.count, previousCount: 0, promptCount: u.promptCount }))
    .slice(0, LIMITS.recentChanges);

  const droppedPages: RecentChangeUrl[] = previous
    .filter((u) => u.count >= MIN_COUNT_FOR_CHANGE)
    .map((u) => ({ prev: u, curr: currByUrl.get(u.normalizedUrl) }))
    .filter(({ prev, curr }) => (prev.count - (curr?.count ?? 0)) / prev.count >= 0.5)
    .sort((a, b) => b.prev.count - a.prev.count)
    .slice(0, LIMITS.recentChanges)
    .map(({ prev, curr }) => ({ url: prev.url, title: prev.title, domain: prev.domain, count: curr?.count ?? 0, previousCount: prev.count, promptCount: prev.promptCount }));

  const titleChanges: TitleChange[] = current
    .filter((u) => {
      const p = prevByUrl.get(u.normalizedUrl);
      return p?.title && u.title && p.title !== u.title;
    })
    .slice(0, LIMITS.recentChanges)
    .map((u) => ({ url: u.url, domain: u.domain, previousTitle: prevByUrl.get(u.normalizedUrl)!.title!, currentTitle: u.title! }));

  const currDomains = rollUpCitationDomains(current);
  const prevDomains = rollUpCitationDomains(previous);
  const prevDomainMap = new Map(prevDomains.map((d) => [d.domain, d]));
  const currDomainMap = new Map(currDomains.map((d) => [d.domain, d]));

  const newDomains: RecentChangeDomain[] = currDomains
    .filter((d) => !prevDomainMap.has(d.domain) && d.count >= MIN_COUNT_FOR_CHANGE)
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMITS.recentChanges)
    .map((d) => ({ domain: d.domain, category: d.category, count: d.count, previousCount: 0 }));

  const droppedDomains: RecentChangeDomain[] = prevDomains
    .filter((d) => d.count >= MIN_COUNT_FOR_CHANGE && !currDomainMap.has(d.domain))
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMITS.recentChanges)
    .map((d) => ({ domain: d.domain, category: d.category, count: 0, previousCount: d.count }));

  return { newPages, droppedPages, titleChanges, newDomains, droppedDomains };
}

export interface ContentGapPrompt {
  promptId: string;
  promptText: string;
  competitorCitationCount: number;
  uniqueCompetitors: number;
}

// Prompt-level: a competitor domain got cited in responses to this prompt,
// but the brand's own domain never did, within the current window.
export function buildContentGaps(rows: CitationRow[]): ContentGapPrompt[] {
  const byPrompt = new Map<string, { promptText: string; hasBrand: boolean; competitorCount: number; competitorDomains: Set<string> }>();
  for (const row of rows) {
    const entry = byPrompt.get(row.promptId) ?? { promptText: row.promptText, hasBrand: false, competitorCount: 0, competitorDomains: new Set<string>() };
    if (row.category === "brand") entry.hasBrand = true;
    if (row.category === "competitor") {
      entry.competitorCount += 1;
      entry.competitorDomains.add(row.domain);
    }
    byPrompt.set(row.promptId, entry);
  }
  return [...byPrompt.entries()]
    .filter(([, v]) => v.competitorDomains.size > 0 && !v.hasBrand)
    .map(([promptId, v]) => ({ promptId, promptText: v.promptText, competitorCitationCount: v.competitorCount, uniqueCompetitors: v.competitorDomains.size }))
    .sort((a, b) => b.competitorCitationCount - a.competitorCitationCount);
}

export interface SubredditStat {
  subreddit: string;
  count: number;
  pageCount: number;
  newCount: number;
  threads: Array<{ url: string; title?: string; count: number; isNew: boolean }>;
}

export function buildRedditRollup(urlStats: UrlStat[], newUrls: Set<string>): SubredditStat[] {
  const bySubreddit = new Map<string, { count: number; pageCount: number; newCount: number; threads: Array<{ url: string; title?: string; count: number; isNew: boolean }> }>();
  for (const u of urlStats) {
    if (!isRedditDomain(u.domain)) continue;
    const subreddit = extractSubreddit(u.url) ?? "r/unknown";
    const entry = bySubreddit.get(subreddit) ?? { count: 0, pageCount: 0, newCount: 0, threads: [] };
    const isNew = newUrls.has(u.normalizedUrl);
    entry.count += u.count;
    entry.pageCount += 1;
    if (isNew) entry.newCount += 1;
    entry.threads.push({ url: u.url, title: u.title, count: u.count, isNew });
    bySubreddit.set(subreddit, entry);
  }
  return [...bySubreddit.entries()]
    .map(([subreddit, e]) => ({ subreddit, count: e.count, pageCount: e.pageCount, newCount: e.newCount, threads: e.threads.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMITS.reddit);
}
