import { google } from "googleapis";
import type { SearchConsoleRow, SearchConsolePageMetrics } from "./types";

// Thin wrapper around the real Search Console Search Analytics API, for
// once a project has a connected token pair. Not the focus of this pass
// (the connect flow is) - kept minimal but real, not mocked, per the same
// reasoning as client.ts: there's no honest way to mock "OAuth worked."
//
// Callers are responsible for:
// - refreshing accessToken via the refresh token before it expires
// - respecting the ~2-3 day GSC reporting lag (don't request `endDate`
//   inside that window and treat the result as complete)
// - paginating with startRow if they need more than 25,000 rows (the
//   per-request cap) and staying under the 50,000 rows/day/site quota
// - syncing incrementally (yesterday's new rows), not re-fetching full
//   history on every dashboard load - see PRD Section 5.6
export async function getSearchConsolePerformance(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 1000,
): Promise<SearchConsoleRow[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: Math.min(rowLimit, 25_000),
    },
  });

  return (res.data.rows ?? []).map((row) => ({
    date: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

// Real query+page breakdown - the two-dimension report GSC's own UI uses
// to power its Queries/Pages/Striking-distance views. One row per real
// (query, page) pair actually seen in Search Console, not per date - `date`
// is always "" here since it isn't a requested dimension. Query-only and
// page-only aggregates (see gsc-insights-breakdown.ts) are derived from
// this single real fetch rather than making 3 separate GSC calls.
//
// Capped well under GSC's real 25,000-row API limit - a busy site's real
// query+page combinations can be huge, and nothing downstream (client-side
// table pagination) needs more than a few thousand rows to be useful.
export async function getSearchConsoleQueryPageBreakdown(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 5_000,
): Promise<SearchConsoleRow[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: Math.min(rowLimit, 25_000),
    },
  });

  return (res.data.rows ?? []).map((row) => ({
    date: "",
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

// Real Search Console data scoped to exactly one page URL (via
// dimensionFilterGroups, not client-side filtering of a site-wide fetch) -
// for Page Analyzer's "how has this specific page actually performed in
// Search Console" section. GSC's `equals` operator is not fuzzy/normalized,
// so an exact single-string match on `pageUrl` used to genuinely miss real
// data for the single most common real-world case: a homepage URL entered/
// stored without a trailing slash (e.g. "https://example.com") while GSC
// itself indexes "https://example.com/". Queried as an OR across both the
// given form and its trailing-slash-toggled variant (dimensionFilterGroups
// is itself an OR between groups, AND within one group) - one real request,
// not two, and a no-op when the URL has no trailing-slash ambiguity to
// begin with (e.g. any real sub-path).
function trailingSlashVariant(pageUrl: string): string | null {
  try {
    // Validates this is a real absolute URL - the actual toggle below works
    // on the raw string, not the parsed URL, since URL always normalizes an
    // empty path to "/" and would otherwise erase the very distinction
    // (bare "https://example.com" vs. "https://example.com/") this exists
    // to catch, which is exactly the homepage case.
    new URL(pageUrl);
  } catch {
    return null;
  }
  if (pageUrl.endsWith("/")) {
    return pageUrl.length > 1 ? pageUrl.slice(0, -1) : null;
  }
  return `${pageUrl}/`;
}

export async function getSearchConsolePageMetrics(
  accessToken: string,
  siteUrl: string,
  pageUrl: string,
  startDate: string,
  endDate: string,
): Promise<SearchConsolePageMetrics> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const variant = trailingSlashVariant(pageUrl);
  const urlsToMatch = variant ? [pageUrl, variant] : [pageUrl];

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      dimensionFilterGroups: urlsToMatch.map((url) => ({ filters: [{ dimension: "page", operator: "equals", expression: url }] })),
      rowLimit: 25,
    },
  });

  const topQueries = (res.data.rows ?? [])
    .map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const totalClicks = topQueries.reduce((sum, q) => sum + q.clicks, 0);
  const totalImpressions = topQueries.reduce((sum, q) => sum + q.impressions, 0);
  // Impression-weighted, matching how GSC's own UI rolls up average
  // position across multiple queries for the same page.
  const avgPosition = totalImpressions > 0 ? topQueries.reduce((sum, q) => sum + q.position * q.impressions, 0) / totalImpressions : 0;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

  return { totalClicks, totalImpressions, avgCtr, avgPosition, topQueries: topQueries.slice(0, 10) };
}
