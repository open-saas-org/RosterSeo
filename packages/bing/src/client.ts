import type { BingPerformanceRow, BingSite } from "./types";

// Bing Webmaster Tools API: https://ssl.bing.com/webmaster/api.svc/json/{Method}
// Authenticated with one global apikey (Bing Webmaster Tools -> Settings ->
// API access) - a single workspace-level key, same shape as PageSpeed's
// GOOGLE_PAGESPEED_API_KEY, not per-org OAuth.

export function isBingConfigured(): boolean {
  return Boolean(process.env.BING_WEBMASTER_API_KEY);
}

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

async function bingGet<T>(method: string, params: Record<string, string> = {}, timeoutMs = 20_000): Promise<T> {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) throw new Error("BING_WEBMASTER_API_KEY is not configured");

  const url = new URL(`${BING_API_BASE}/${method}`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Bing Webmaster ${method} returned HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Bing's Webmaster API is a legacy WCF/ASP.NET Data Services endpoint, not
// a plain REST API - confirmed live (a bare-array parse crashed with
// "(data ?? []).map is not a function") that real responses wrap the
// payload in a top-level "d" property: `{ "d": [...] }`, sometimes further
// nested as `{ "d": { "results": [...] } }` (the OData v2 shape). Unwrap
// whichever shape shows up rather than assuming one, and fail loudly (with
// the raw shape) if it's still not an array, instead of crashing on `.map`.
function unwrapBingArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const d = (raw as Record<string, unknown>).d;
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).results)) {
      return (d as Record<string, unknown>).results as unknown[];
    }
  }
  if (raw === null || raw === undefined) return [];
  throw new Error(`Unexpected Bing Webmaster response shape: ${JSON.stringify(raw).slice(0, 300)}`);
}

// GetUserSites - real method per Bing's API docs, returns every site
// verified under this API key's account.
export async function listBingSites(): Promise<BingSite[]> {
  const data = await bingGet<unknown>("GetUserSites");
  return unwrapBingArray(data)
    .map((row) => ({ url: (row as { Url?: string }).Url ?? "" }))
    .filter((s) => s.url);
}

// Same legacy-API reality as the "d" envelope above: Bing's `Date` fields
// come back in the old ASP.NET JSON date format - `/Date(1234567890000)/`
// (epoch milliseconds, sometimes with a `-0700`-style timezone suffix),
// not ISO 8601 - confirmed live (`new Date(row.Date)` threw "Invalid time
// value" on a real response). Parse that format explicitly; fall back to a
// plain ISO parse in case a future/different Bing endpoint ever sends one.
function parseBingDate(raw: string): string {
  const aspNetMatch = raw.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
  const ms = aspNetMatch ? Number(aspNetMatch[1]) : Date.parse(raw);
  const parsed = new Date(ms);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable Bing date value: ${raw}`);
  }
  return parsed.toISOString().slice(0, 10);
}

// GetRankAndTrafficStats - real method per Bing's API docs, one row per day
// with Clicks/Impressions/Ctr/AvgClickPosition.
export async function getBingRankAndTrafficStats(siteUrl: string, startDate: string, endDate: string): Promise<BingPerformanceRow[]> {
  const data = await bingGet<unknown>("GetRankAndTrafficStats", { siteUrl });

  return unwrapBingArray(data)
    .map((row) => row as { Date?: string; Clicks?: number; Impressions?: number; Ctr?: number; AvgClickPosition?: number })
    .filter((row) => row.Date)
    .map((row) => ({
      date: parseBingDate(row.Date!),
      clicks: row.Clicks ?? 0,
      impressions: row.Impressions ?? 0,
      ctr: row.Ctr ?? 0,
      avgClickPosition: row.AvgClickPosition ?? 0,
    }))
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}
