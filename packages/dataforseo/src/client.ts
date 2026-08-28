import type {
  BacklinkItem,
  BacklinksOverview,
  BusinessListingDetails,
  CountryOption,
  DomainOverview,
  KeywordMetrics,
  LocalPackResult,
  LocationOption,
  MapsBusinessResult,
  SerpResult,
} from "./types";
import { recordDataForSeoSpend } from "./spend";

// isDataForSeoConfigured() gates every function below: when
// DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD aren't set, or a real call fails,
// the function throws (or returns an honest empty/null result for a
// list/optional value) - never fabricated data standing in for real data.
// A "Mock data" badge or made-up trend line is worse than an honest error,
// since nothing in the UI can tell it apart from the real thing.

export function isDataForSeoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

// Thrown when DATAFORSEO_LOGIN/PASSWORD aren't set - no real call is
// possible at all, and the caller needs to know that rather than getting
// silently-empty or fabricated results.
export class DataForSeoNotConfiguredError extends Error {
  constructor(message = "DataForSEO isn't configured. Set DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD to enable real data.") {
    super(message);
  }
}

// ── Real DataForSEO API ──────────────────────────────────────────────────

const DATAFORSEO_API_BASE = "https://api.dataforseo.com/v3";

function dataForSeoAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN!;
  const password = process.env.DATAFORSEO_PASSWORD!;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

// A successful task (status_code 20000) with `result: null`/`undefined` is
// a real, documented DataForSEO shape (e.g. a task that's still queued, or
// a query that structurally can't return anything for this endpoint) - but
// every caller's `result?.[0]` / `?? []` style unwrapping makes that
// indistinguishable from "the API's real envelope shape changed out from
// under us" (a renamed field, `result` moved, etc.), which would otherwise
// silently degrade into "zero real results" instead of surfacing as a real
// error. Throwing here - once, at the shared choke point every real call
// goes through - turns that whole failure class loud instead of quietly
// indistinguishable from a legitimate empty answer.
function assertRealResult<T>(path: string, result: T | null | undefined): T {
  if (result === null || result === undefined) {
    throw new Error(`DataForSEO ${path} returned no result (task succeeded but result was ${result})`);
  }
  return result;
}

async function dataForSeoPost<T>(path: string, body: unknown[], timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${DATAFORSEO_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: dataForSeoAuthHeader() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    // Real, dynamic, cost-incurring API calls - never let Next.js's own
    // fetch cache silently serve a stale/cached response underneath our
    // own DB-backed caching (competitor_snapshot_cache, keyword_metrics_
    // cache, etc). Also avoids Next's dev-mode fetch-cache LRU warning
    // ("Single item size exceeds maxSize") on the larger responses here.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} returned HTTP ${res.status}`);

  const data = await res.json();
  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} error: ${data.status_message}`);
  }
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} task error: ${task?.status_message ?? "no task returned"}`);
  }
  // DataForSEO's own real per-task cost, in USD - not an estimate. Logged
  // only on real success (a thrown-before-here request never got billed).
  if (typeof task.cost === "number") recordDataForSeoSpend({ operation: path, costUsd: task.cost });
  return assertRealResult(path, task.result as T | null | undefined);
}

async function dataForSeoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DATAFORSEO_API_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: dataForSeoAuthHeader() },
    signal: AbortSignal.timeout(30_000),
    // Already cached ourselves at the module level (countriesCache/
    // countryDatasetCache below) - Next's own fetch cache underneath that
    // is redundant, and its LRU can't hold the larger per-country payloads
    // anyway (see the "Single item size exceeds maxSize" dev warning).
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} returned HTTP ${res.status}`);

  const data = await res.json();
  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} error: ${data.status_message}`);
  }
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} task error: ${task?.status_message ?? "no task returned"}`);
  }
  if (typeof task.cost === "number") recordDataForSeoSpend({ operation: path, costUsd: task.cost });
  return assertRealResult(path, task.result as T | null | undefined);
}

// A few common abbreviations/short forms real country names don't
// literally contain, layered on top of the real DataForSEO country list
// below rather than a hardcoded name->code table - onboarding's target
// location field is free text (no picker, no validation), so a project
// created with e.g. "Philippines" or "South Africa" needs a real lookup,
// not a ~19-country guess-list that silently defaults everything else to
// the US.
const LOCATION_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  uk: "united kingdom",
  uae: "united arab emirates",
};

// Not fabricated location data - a legitimate default (Google Ads/
// DataForSEO's own US location_code) for when a project's free-text
// targetLocation can't be resolved to a real one, same category as
// defaulting an unset date range rather than invented business metrics.
const DEFAULT_LOCATION_CODE = 2840; // United States

// Resolves a free-text location string (e.g. a project's onboarding
// `targetLocation`, never validated against a real list at entry) to a
// real DataForSEO location_code via the actual country list
// (listLocationCountries, cached in-memory) instead of a small hardcoded
// name table - exact match first, then a loose substring match for text
// like "London, UK" or "New York, USA", falling back to the US only when
// nothing real matches at all (including when DataForSEO isn't configured
// or the lookup fails).
export async function resolveLocationCode(location?: string): Promise<number> {
  const normalized = location?.trim().toLowerCase();
  if (!normalized) return DEFAULT_LOCATION_CODE;

  try {
    const countries = await listLocationCountries();
    const target = LOCATION_ALIASES[normalized] ?? normalized;

    const exact = countries.find((c) => c.name.toLowerCase() === target);
    if (exact) return exact.code;

    const partial = countries.find((c) => {
      const name = c.name.toLowerCase();
      return target.includes(name) || name.includes(target);
    });
    if (partial) return partial.code;
  } catch (err) {
    console.error("[dataforseo] resolveLocationCode: real country list lookup failed, defaulting to US:", err);
  }

  return DEFAULT_LOCATION_CODE;
}

interface DataForSeoSerpItem {
  type: string;
  rank_absolute?: number;
  rank_group?: number;
  domain?: string;
  url?: string;
  title?: string;
}

async function getSerpResultsReal(keyword: string, location: string): Promise<SerpResult[]> {
  const locationCode = await resolveLocationCode(location);
  const result = await dataForSeoPost<{ items?: DataForSeoSerpItem[] }[]>(
    "/serp/google/organic/live/advanced",
    [{ keyword, location_code: locationCode, language_code: "en", device: "desktop", depth: 10 }],
  );

  const items = result?.[0]?.items ?? [];
  // Same field-presence check as checkKeywordRankingReal above (see its
  // comment) - a real rank is never 0, so a missing rank_absolute/
  // rank_group is dropped rather than fabricated as position 0.
  return items
    .filter((item) => item.type === "organic" && item.url && item.domain && (item.rank_absolute != null || item.rank_group != null))
    .slice(0, 10)
    .map((item) => ({
      position: item.rank_absolute ?? item.rank_group!,
      domain: item.domain!,
      url: item.url!,
      title: item.title ?? "",
    }));
}

// DataForSEO's real serp/google/organic/live/advanced type values that
// represent a real, visible non-organic SERP block - not exhaustive of
// every possible type DataForSEO can return, but covers the ones users
// actually care about seeing. Unrecognized types are skipped, not errored.
const SERP_FEATURE_LABELS: Record<string, string> = {
  people_also_ask: "PAA",
  featured_snippet: "Featured Snippet",
  video: "Video",
  images: "Images",
  local_pack: "Local Pack",
  map_pack: "Local Pack",
  knowledge_graph: "Knowledge Panel",
  top_stories: "Top Stories",
  shopping: "Shopping",
  ai_overview: "AI Overview",
};

// Real Rank Tracking check: unlike getSerpResultsReal (which only keeps
// organic results, for Page Analyzer's competitor-SERP use case), this
// keeps every item's `type` to build a real serpFeatures list, and takes
// a real location_code + device instead of a free-text location and a
// hardcoded desktop. Organic results are returned so the caller can match
// its own domain among them (device/location vary what's "found" -
// keeping domain-matching in the caller, not here, since normalizeDomain()
// is an apps/web utility this package shouldn't depend on).
async function checkKeywordRankingReal(
  keyword: string,
  locationCode: number,
  device: "desktop" | "mobile",
): Promise<{ organicResults: SerpResult[]; serpFeatures: string[] }> {
  const result = await dataForSeoPost<{ items?: DataForSeoSerpItem[] }[]>("/serp/google/organic/live/advanced", [
    { keyword, location_code: locationCode, language_code: "en", device, depth: 10 },
  ]);

  const items = result?.[0]?.items ?? [];
  const organicResults = items
    // Position field-presence check kept separate from the type/url/domain
    // filter above it on purpose: a real rank is never 0 (positions start
    // at 1), so if DataForSEO ever renamed rank_absolute/rank_group while
    // leaving type/url/domain intact, `?? 0` would fabricate a fake
    // "position 0" for every organic result. Dropping the item instead
    // means a rename here shows up as fewer (or zero) organic results.
    .filter((item) => item.type === "organic" && item.url && item.domain && (item.rank_absolute != null || item.rank_group != null))
    .slice(0, 10)
    .map((item) => ({
      position: item.rank_absolute ?? item.rank_group!,
      domain: item.domain!,
      url: item.url!,
      title: item.title ?? "",
    }));

  const serpFeatures = [...new Set(items.map((item) => SERP_FEATURE_LABELS[item.type]).filter((label): label is string => Boolean(label)))];

  return { organicResults, serpFeatures };
}

interface DataForSeoKeywordInfo {
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number; // 0-1, paid/ads competition - distinct from keyword_properties.keyword_difficulty
    monthly_searches?: { year: number; month: number; search_volume: number }[];
  };
  keyword_properties?: { keyword_difficulty?: number };
  search_intent_info?: { main_intent?: string };
}

function toKeywordMetrics(keyword: string, item: DataForSeoKeywordInfo | undefined): KeywordMetrics | null {
  if (!item?.keyword_info) return null;
  const info = item.keyword_info;
  // monthly_searches comes back newest-first; reverse to oldest-first so
  // trend[] reads left-to-right chronologically.
  const trend = (info.monthly_searches ?? [])
    .slice(0, 12)
    .reverse()
    .map((m) => m.search_volume ?? 0);

  return {
    keyword,
    searchVolume: info.search_volume ?? 0,
    difficulty: item.keyword_properties?.keyword_difficulty ?? 0,
    cpc: info.cpc ?? 0,
    competition: info.competition ?? null,
    trend: trend.length > 0 ? trend : Array.from({ length: 12 }, () => info.search_volume ?? 0),
    intent: item.search_intent_info?.main_intent ?? null,
  };
}

async function getKeywordMetricsReal(keyword: string, locationCode = 2840): Promise<KeywordMetrics> {
  const result = await dataForSeoPost<{ items?: DataForSeoKeywordInfo[] }[]>(
    "/dataforseo_labs/google/keyword_overview/live",
    [{ keywords: [keyword], location_code: locationCode, language_code: "en" }],
  );

  const metrics = toKeywordMetrics(keyword, result?.[0]?.items?.[0]);
  if (!metrics) throw new Error("DataForSEO keyword_overview returned no data");
  return metrics;
}

// keyword_ideas items are flat (keyword/keyword_info/keyword_properties/
// search_intent_info all directly on the item) - unlike ranked_keywords'
// keyword_data-wrapped shape below, so this just adds a sibling `keyword`
// field to the existing interface rather than nesting it.
interface DataForSeoKeywordIdeaItem extends DataForSeoKeywordInfo {
  keyword?: string;
}

// Real category-based keyword ideas for a seed (broader semantic
// relatives, not just literal substring matches) - what actually powers
// Keyword Research's results grid.
async function getKeywordIdeasReal(seed: string, locationCode: number, limit: number): Promise<KeywordMetrics[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoKeywordIdeaItem[] }[]>(
    "/dataforseo_labs/google/keyword_ideas/live",
    [
      {
        keywords: [seed],
        location_code: locationCode,
        language_code: "en",
        limit,
        order_by: ["keyword_info.search_volume,desc"],
      },
    ],
  );

  const items = result?.[0]?.items ?? [];
  return items
    .map((item) => (item.keyword ? toKeywordMetrics(item.keyword, item) : null))
    .filter((m): m is KeywordMetrics => m !== null);
}

// keyword_suggestions items are flat, same shape as keyword_ideas - full-
// text search results (the seed appears literally inside each result,
// e.g. "seed near me", "best seed") rather than category-matched, so
// these read as real variations of the seed itself.
async function getKeywordSuggestionsReal(seed: string, locationCode: number, limit: number): Promise<KeywordMetrics[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoKeywordIdeaItem[] }[]>(
    "/dataforseo_labs/google/keyword_suggestions/live",
    [
      {
        keyword: seed,
        location_code: locationCode,
        language_code: "en",
        limit,
        order_by: ["keyword_info.search_volume,desc"],
      },
    ],
  );

  const items = result?.[0]?.items ?? [];
  return items
    .map((item) => (item.keyword ? toKeywordMetrics(item.keyword, item) : null))
    .filter((m): m is KeywordMetrics => m !== null);
}

interface DataForSeoRankedKeywordItem {
  keyword_data?: DataForSeoKeywordInfo & { keyword?: string };
}

// related_keywords wraps each result under keyword_data (same shape
// ranked_keywords uses below) plus a depth/related_keywords tree we don't
// need - these are real keywords pulled from Google's own "searches
// related to" SERP box, the closest real semantic neighbors of the seed.
async function getRelatedKeywordsReal(seed: string, locationCode: number, limit: number): Promise<KeywordMetrics[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoRankedKeywordItem[] }[]>(
    "/dataforseo_labs/google/related_keywords/live",
    [
      {
        keyword: seed,
        location_code: locationCode,
        language_code: "en",
        depth: 2,
        limit,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ],
  );

  const items = result?.[0]?.items ?? [];
  return items
    .map((item) => {
      const keyword = item.keyword_data?.keyword;
      if (!keyword) return null;
      return toKeywordMetrics(keyword, item.keyword_data);
    })
    .filter((m): m is KeywordMetrics => m !== null);
}

// Real keywords a domain actually ranks for (not template-suffixed
// nonsense) - used by the Competitors page for "keyword ideas" about a
// competitor domain.
// This specific endpoint has been observed intermittently slow/erroring
// (a real DataForSEO-side issue, not ours) - a shorter timeout than the
// 20s default so a flaky response here can't hold up the whole Competitors
// "Scan" action for 30+ seconds. getRankedKeywords already treats any
// failure (including a timeout abort) the same way: log it, return [],
// keyword gap ideas is the least essential of the three things Scan pulls.
const RANKED_KEYWORDS_TIMEOUT_MS = 10_000;

async function getRankedKeywordsReal(domain: string, limit: number, locationCode: number): Promise<KeywordMetrics[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoRankedKeywordItem[] }[]>(
    "/dataforseo_labs/google/ranked_keywords/live",
    [
      {
        target: domain,
        location_code: locationCode,
        language_code: "en",
        limit,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ],
    RANKED_KEYWORDS_TIMEOUT_MS,
  );

  const items = result?.[0]?.items ?? [];
  return items
    .map((item) => {
      const keyword = item.keyword_data?.keyword;
      if (!keyword) return null;
      return toKeywordMetrics(keyword, item.keyword_data);
    })
    .filter((m): m is KeywordMetrics => m !== null);
}

// domain_rank_overview's real response nests one level deeper than the
// endpoint name suggests: result[0] is a query-echo wrapper (target/
// location_code/total_count/items_count), and the actual metrics live at
// result[0].items[0].metrics.organic - confirmed live against the real API
// (result[0].metrics.organic, what this used to read, is always undefined
// on the real endpoint). This is what threw "returned no data" for every
// single real domain once the mock fallback that used to paper over it was
// removed - a genuine parsing bug, not a "no data for this domain" case.
interface DataForSeoDomainRankOverviewItem {
  items?: Array<{ metrics?: { organic?: { count?: number; etv?: number } } }>;
}

interface DataForSeoRelevantPageItem {
  page_address?: string;
  metrics?: { organic?: { etv?: number } };
}

async function getDomainOverviewReal(domain: string, locationCode: number): Promise<DomainOverview> {
  // relevant_pages (top pages - a nice-to-have) is called separately from
  // domain_rank_overview (traffic/keyword count - the headline numbers)
  // and never allowed to take those down with it: confirmed live that
  // relevant_pages intermittently 500s on DataForSEO's side (same real
  // flakiness as ranked_keywords) while domain_rank_overview succeeds -
  // Promise.all would previously discard real, already-successful traffic
  // data just because the pages list failed alongside it.
  const [rankResult, pagesResult] = await Promise.all([
    dataForSeoPost<DataForSeoDomainRankOverviewItem[]>("/dataforseo_labs/google/domain_rank_overview/live", [
      { target: domain, location_code: locationCode, language_code: "en" },
    ]),
    dataForSeoPost<{ items?: DataForSeoRelevantPageItem[] }[]>("/dataforseo_labs/google/relevant_pages/live", [
      { target: domain, location_code: locationCode, language_code: "en", limit: 5 },
    ]).catch((err) => {
      console.error("[dataforseo] Real relevant_pages call failed:", err);
      return [];
    }),
  ]);

  const organic = rankResult?.[0]?.items?.[0]?.metrics?.organic;
  const pages = pagesResult?.[0]?.items ?? [];

  if (!organic) throw new Error("DataForSEO domain_rank_overview returned no data");

  return {
    domain,
    // DataForSEO's Estimated Traffic Value (a dollar-valued estimate of
    // what the domain's organic rankings would cost as paid traffic), not
    // a literal monthly visit count - the closest real proxy DataForSEO
    // Labs exposes without a separate paid-traffic-cost data source.
    estimatedMonthlyTraffic: Math.round(organic.etv ?? 0),
    organicKeywords: organic.count ?? 0,
    topPages: pages
      .filter((p) => p.page_address)
      .map((p) => ({ url: p.page_address!, traffic: Math.round(p.metrics?.organic?.etv ?? 0) })),
  };
}

interface DataForSeoBacklinksSummary {
  backlinks?: number;
  referring_domains?: number;
  rank?: number;
}

async function getBacklinksOverviewReal(domain: string): Promise<BacklinksOverview> {
  const result = await dataForSeoPost<DataForSeoBacklinksSummary[]>("/backlinks/summary/live", [
    { target: domain, internal_list_limit: 10 },
  ]);

  const summary = result?.[0];
  if (!summary) throw new Error("DataForSEO backlinks/summary returned no data");

  return {
    domain,
    totalBacklinks: summary.backlinks ?? 0,
    referringDomains: summary.referring_domains ?? 0,
    // DataForSEO's domain rank is roughly 0-1000; normalize to a 0-100
    // "domain rating" scale to match this app's existing display contract.
    domainRating: Math.min(100, Math.round((summary.rank ?? 0) / 10)),
  };
}

interface DataForSeoBacklinkItem {
  domain_from?: string;
  url_from?: string;
  url_to?: string;
  anchor?: string | null;
  dofollow?: boolean;
  domain_from_rank?: number;
  backlink_spam_score?: number;
  first_seen?: string | null;
  last_seen?: string | null;
  is_new?: boolean;
  is_lost?: boolean;
}

const BACKLINKS_LIST_LIMIT = 200;

async function getBacklinksListReal(domain: string): Promise<BacklinkItem[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoBacklinkItem[] }[]>("/backlinks/backlinks/live", [
    { target: domain, mode: "as_is", limit: BACKLINKS_LIST_LIMIT, order_by: ["domain_from_rank,desc"], include_subdomains: true },
  ]);

  const items = result?.[0]?.items ?? [];
  // domain_from/url_from are the real identity of a backlink row - drop
  // (not fabricate) any item missing them, same "never invent a fallback
  // for a load-bearing field" convention as the SERP/local-pack parsing
  // above, rather than showing a blank/mislabeled row.
  return items
    .filter((item) => item.domain_from && item.url_from)
    .map((item) => ({
      domainFrom: item.domain_from!,
      urlFrom: item.url_from!,
      urlTo: item.url_to ?? domain,
      anchor: item.anchor ?? null,
      dofollow: item.dofollow ?? true,
      domainFromRank: item.domain_from_rank ?? 0,
      spamScore: item.backlink_spam_score ?? 0,
      firstSeen: item.first_seen ?? null,
      lastSeen: item.last_seen ?? null,
      isNew: item.is_new ?? false,
      isLost: item.is_lost ?? false,
    }));
}

interface DataForSeoMapsItem {
  type: string;
  rank_absolute?: number;
  title?: string;
  rating?: { value?: number; votes_count?: number };
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  place_id?: string;
}

// Maps live/advanced is a real synchronous Google Maps scrape, not a
// cached lookup - it routinely takes well over 20s (confirmed live: a
// real search timed out at the old 20s limit after already running
// ~24s). 55s leaves headroom under Next.js's default route timeout.
const MAPS_LIVE_TIMEOUT_MS = 55_000;

async function getLocalPackResultsReal(keyword: string, location: string): Promise<LocalPackResult[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoMapsItem[] }[]>(
    "/serp/google/maps/live/advanced",
    [{ keyword, location_name: location, language_code: "en", depth: 10 }],
    MAPS_LIVE_TIMEOUT_MS,
  );

  const items = result?.[0]?.items ?? [];
  // Same field-presence check as the organic SERP functions above - a real
  // rank is never 0, so a missing rank_absolute is dropped, not faked.
  return items
    .filter((item) => item.type === "maps_search" && item.title && item.rank_absolute != null)
    .slice(0, 3)
    .map((item) => ({
      position: item.rank_absolute!,
      businessName: item.title!,
      rating: item.rating?.value ?? 0,
      reviewCount: item.rating?.votes_count ?? 0,
    }));
}

// Same endpoint as getLocalPackResultsReal, but queried at a specific real
// lat/lng point (location_coordinate: "lat,lng,zoom") instead of a
// free-text location - what geo-grid scans need to check rank at each grid
// cell around a business. Unlike the function above, this returns up to
// `depth: 20` results UNSLICED (not capped to top 3): a grid check needs to
// tell "found at position 14" apart from "not found at all", which a top-3
// cap can't do. zoom defaults to 15 (roughly neighborhood-level), matching
// the scale geo-grid tools typically operate at (a few km radius).
async function getLocalPackResultsAtCoordinateReal(
  keyword: string,
  lat: number,
  lng: number,
  zoom = 15,
): Promise<LocalPackResult[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoMapsItem[] }[]>(
    "/serp/google/maps/live/advanced",
    [{ keyword, location_coordinate: `${lat},${lng},${zoom}z`, language_code: "en", depth: 20 }],
    MAPS_LIVE_TIMEOUT_MS,
  );

  const items = result?.[0]?.items ?? [];
  return items
    .filter((item) => item.type === "maps_search" && item.title && item.rank_absolute != null)
    .map((item) => ({
      position: item.rank_absolute!,
      businessName: item.title!,
      rating: item.rating?.value ?? 0,
      reviewCount: item.rating?.votes_count ?? 0,
    }));
}

// Real Google Maps business search - same endpoint as the local-pack
// functions above, but returning the fuller per-listing fields (address,
// coordinates, category, place_id) rather than just position/rating. Lets
// a user find and pick their own real business by name instead of typing
// in lat/lng by hand - no Google Business Profile OAuth needed at all,
// since this is public Maps search data, not the business owner's private
// GBP account.
//
// Takes a real `locationCode` (from listLocationCountries/States/Cities
// below) instead of a free-text location_name string - a bare city name
// like "Gurugram" gets rejected by DataForSEO outright (confirmed live:
// HTTP 40501 "Invalid Field: 'location_name'"), and even a correctly-
// formatted "City,Region,Country" string is still just a guess at what
// DataForSEO's real hierarchy actually calls that place. A location_code
// sourced from DataForSEO's own real location list can never be wrong.
async function searchMapsBusinessesReal(query: string, locationCode: number): Promise<MapsBusinessResult[]> {
  const result = await dataForSeoPost<{ items?: DataForSeoMapsItem[] }[]>(
    "/serp/google/maps/live/advanced",
    [{ keyword: query, location_code: locationCode, language_code: "en", depth: 10 }],
    MAPS_LIVE_TIMEOUT_MS,
  );

  const items = result?.[0]?.items ?? [];
  return items
    .filter((item) => item.type === "maps_search" && item.title)
    .map((item) => ({
      title: item.title!,
      address: item.address ?? null,
      lat: item.latitude ?? null,
      lng: item.longitude ?? null,
      rating: item.rating?.value ?? null,
      reviewCount: item.rating?.votes_count ?? 0,
      category: item.category ?? null,
      placeId: item.place_id ?? null,
    }));
}

// ── Real location hierarchy (Country -> State -> City) ──────────────────
// The canonical source of valid location_code values - DataForSEO mirrors
// Google Ads' geo-target list (270k+ rows globally). Cached in-memory per
// process (this is static reference data, not something that changes
// during a process's lifetime) so picking a country/state doesn't re-fetch
// the same real, sizeable payload on every request - the per-country
// endpoint alone returns 60k+ rows for a country the size of the US.

interface DataForSeoLocationRaw {
  location_code: number;
  location_name: string;
  location_code_parent: number | null;
  country_iso_code: string;
  location_type: string;
}

let countriesCache: CountryOption[] | null = null;
const countryDatasetCache = new Map<string, DataForSeoLocationRaw[]>();

async function getCountryDataset(countryIsoCode: string): Promise<DataForSeoLocationRaw[]> {
  const cached = countryDatasetCache.get(countryIsoCode);
  if (cached) return cached;
  const result = await dataForSeoGet<DataForSeoLocationRaw[]>(`/serp/google/locations/${countryIsoCode}`);
  countryDatasetCache.set(countryIsoCode, result);
  return result;
}

// Real list of every country DataForSEO/Google Ads recognizes. Carries both
// the numeric location_code (needed if a user picks a country with no
// state/city and searches directly) and the ISO code (the only thing the
// per-country locations endpoint accepts - see listLocationStates/Cities).
export async function listLocationCountries(): Promise<CountryOption[]> {
  if (countriesCache) return countriesCache;
  const result = await dataForSeoGet<DataForSeoLocationRaw[]>("/serp/google/locations");
  countriesCache = result
    .filter((r) => r.location_type === "Country")
    .map((r) => ({ code: r.location_code, isoCode: r.country_iso_code, name: r.location_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return countriesCache;
}

// Real top-level administrative divisions (states/provinces/regions) for
// one country - e.g. all 50 US states plus DC/territories.
export async function listLocationStates(countryIsoCode: string): Promise<LocationOption[]> {
  const dataset = await getCountryDataset(countryIsoCode);
  return dataset
    .filter((r) => r.location_type === "State" || r.location_type === "Region")
    .map((r) => ({ code: r.location_code, name: r.location_name.split(",")[0]! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Real cities within one state/region (matched by location_code_parent -
// reuses the same cached per-country dataset the state list came from, no
// extra real API call).
export async function listLocationCities(countryIsoCode: string, stateCode: number): Promise<LocationOption[]> {
  const dataset = await getCountryDataset(countryIsoCode);
  return dataset
    .filter((r) => r.location_type === "City" && r.location_code_parent === stateCode)
    .map((r) => ({ code: r.location_code, name: r.location_name.split(",")[0]! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Public API ────────────────────────────────────────────────────────────
// Every function below either returns real DataForSEO data, an honestly
// empty/null result (no data available, not "here's a fake answer"), or
// throws a real error - never fabricated numbers. A list-returning
// function returns [] when unconfigured or on failure (an empty list is
// already a normal, expected UI state everywhere it's used); a function
// that must return one object throws, so the caller's own error handling
// (already built for real API failures) takes over instead of silently
// swallowing the failure into invented data.

// locationCode is optional (defaults to US/2840) so Page Analyzer's
// existing single-argument call sites keep working unchanged - only
// Keyword Research and Rank Tracking's metrics refresh pass a real one.
// Returns null (never a fabricated KeywordMetrics) when unconfigured or
// the real call fails - callers must handle "we don't have real data for
// this keyword right now" explicitly.
export async function getRealKeywordMetrics(keyword: string, locationCode?: number): Promise<KeywordMetrics | null> {
  if (!isDataForSeoConfigured()) return null;
  try {
    return await getKeywordMetricsReal(keyword, locationCode);
  } catch (err) {
    console.error("[dataforseo] Real keyword_overview call failed:", err);
    return null;
  }
}

export async function getKeywordIdeas(seed: string, locationCode: number, limit = 50): Promise<KeywordMetrics[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getKeywordIdeasReal(seed, locationCode, limit);
  } catch (err) {
    console.error("[dataforseo] Real keyword_ideas call failed:", err);
    return [];
  }
}

// No fallback for these two, by design - a caller can tell "no real
// related/suggestion data available" apart from "here are results". The
// route layer falls through to getKeywordIdeas() as a third tier when
// these two come back too thin.
export async function getRelatedKeywords(seed: string, locationCode: number, limit = 30): Promise<KeywordMetrics[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getRelatedKeywordsReal(seed, locationCode, limit);
  } catch (err) {
    console.error("[dataforseo] Real related_keywords call failed:", err);
    return [];
  }
}

export async function getKeywordSuggestions(seed: string, locationCode: number, limit = 30): Promise<KeywordMetrics[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getKeywordSuggestionsReal(seed, locationCode, limit);
  } catch (err) {
    console.error("[dataforseo] Real keyword_suggestions call failed:", err);
    return [];
  }
}

// locationCode defaults to US/2840 for backward compatibility with
// existing callers, but a real project-scoped caller should pass its
// project's actual target location.
export async function getRankedKeywords(domain: string, limit = 10, locationCode = 2840): Promise<KeywordMetrics[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getRankedKeywordsReal(domain, limit, locationCode);
  } catch (err) {
    console.error("[dataforseo] Real ranked_keywords call failed:", err);
    return [];
  }
}

export async function getSerpResults(keyword: string, location = "United States"): Promise<SerpResult[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getSerpResultsReal(keyword, location);
  } catch (err) {
    console.error("[dataforseo] Real SERP call failed:", err);
    return [];
  }
}

// Returns null (never fabricated competitor-###.com domains) for callers
// (Page Analyzer's competitor comparison) that headline this data as
// "Google's real top 10" and must never silently show mock rows as real.
export async function getRealSerpResults(keyword: string, location = "United States"): Promise<SerpResult[] | null> {
  if (!isDataForSeoConfigured()) return null;
  try {
    const results = await getSerpResultsReal(keyword, location);
    return results.length > 0 ? results : null;
  } catch (err) {
    console.error("[dataforseo] Real SERP call failed:", err);
    return null;
  }
}

// Powers Rank Tracking's Fetch Rankings action (bulk, via rankCheckJob) and
// its single-keyword "check now" route. Returns the real organic result
// set (for the caller to find its own domain in, via normalizeDomain) plus
// every real SERP feature seen.
//
// `isMock` stays in the return shape for backward compatibility with
// keyword_rankings.isMock (a real historical record of past mock checks,
// from before this function stopped generating them) - it is always
// `false` here now; there is no mock path left to set it true.
// Throws (DataForSeoNotConfiguredError, or the real DataForSEO error) when
// a real check genuinely can't happen - a rank-tracking tool's entire
// premise is "this is your real Google position," so a caller must treat
// a failed check as "unknown," never silently record a fabricated one.
export async function checkKeywordRanking(
  keyword: string,
  locationCode: number,
  device: "desktop" | "mobile",
): Promise<{ organicResults: SerpResult[]; serpFeatures: string[]; isMock: boolean }> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();
  const result = await checkKeywordRankingReal(keyword, locationCode, device);
  return { ...result, isMock: false };
}

export async function getDomainOverview(domain: string, locationCode = 2840): Promise<DomainOverview> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();
  return getDomainOverviewReal(domain, locationCode);
}

export async function getBacklinksOverview(domain: string): Promise<BacklinksOverview> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();
  return getBacklinksOverviewReal(domain);
}

export async function getBacklinksList(domain: string): Promise<BacklinkItem[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getBacklinksListReal(domain);
  } catch (err) {
    console.error("[dataforseo] Real backlinks/backlinks call failed:", err);
    return [];
  }
}

export async function getLocalPackResults(keyword: string, location: string): Promise<LocalPackResult[]> {
  if (!isDataForSeoConfigured()) return [];
  try {
    return await getLocalPackResultsReal(keyword, location);
  } catch (err) {
    console.error("[dataforseo] Real maps/live call failed:", err);
    return [];
  }
}

// Throws (rather than returning []) on both "not configured" and a real
// call failure - unlike getLocalPackResults above, an empty array here is
// a real, meaningful outcome (the business genuinely isn't found at this
// grid point) that a grid scan needs to plot as a red/not-found pin, so it
// must stay distinguishable from "we couldn't check this point at all."
export async function getLocalPackResultsAtCoordinate(
  keyword: string,
  lat: number,
  lng: number,
  zoom = 15,
): Promise<LocalPackResult[]> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();
  return getLocalPackResultsAtCoordinateReal(keyword, lat, lng, zoom);
}

// Search real Google Maps listings by name within a real, verified
// location - lets a user find and pick their own real business (with real
// coordinates) for Local SEO's Business Profile, no Google OAuth required.
export async function searchMapsBusinesses(query: string, locationCode: number): Promise<MapsBusinessResult[]> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();
  return searchMapsBusinessesReal(query, locationCode);
}

interface DataForSeoMyBusinessInfoItem {
  title?: string;
  description?: string;
  category?: string;
  additional_categories?: string[];
  cid?: string;
  place_id?: string;
  address?: string;
  phone?: string;
  url?: string;
  domain?: string;
  total_photos?: number;
  latitude?: number;
  longitude?: number;
  is_claimed?: boolean;
  work_time?: unknown;
  attributes?: unknown;
  rating?: { value?: number; votes_count?: number };
}

// Real full listing detail for one confirmed business - everything Google
// Business Profile's own Business Information API would have returned
// (category, hours, phone, attributes, claimed status, cid/place_id for a
// stable re-fetch later), sourced from DataForSEO's Business Data API
// instead. Same real-query requirement as searchMapsBusinesses: `query`
// should be the exact business name at a real `locationCode`.
//
// Fabricated listing details (fake hours, fake categories) would actively
// mislead a user optimizing their real business, not gracefully degrade
// for them. Returns null on a real empty result (nothing found for that
// exact query at that location - a legitimate outcome, not an error);
// throws through any other DataForSEO error.
export async function getBusinessListingDetails(query: string, locationCode: number): Promise<BusinessListingDetails | null> {
  if (!isDataForSeoConfigured()) throw new DataForSeoNotConfiguredError();

  const result = await dataForSeoPost<{ items?: DataForSeoMyBusinessInfoItem[] }[]>(
    "/business_data/google/my_business_info/live",
    [{ keyword: query, location_code: locationCode, language_code: "en" }],
    MAPS_LIVE_TIMEOUT_MS,
  );

  const item = result?.[0]?.items?.[0];
  if (!item || !item.title) return null;

  return {
    title: item.title,
    description: item.description ?? null,
    category: item.category ?? null,
    additionalCategories: item.additional_categories ?? [],
    cid: item.cid ?? null,
    placeId: item.place_id ?? null,
    address: item.address ?? null,
    phone: item.phone ?? null,
    website: item.url ?? null,
    domain: item.domain ?? null,
    totalPhotos: item.total_photos ?? 0,
    lat: item.latitude ?? null,
    lng: item.longitude ?? null,
    isClaimed: item.is_claimed ?? false,
    workTime: item.work_time ?? null,
    attributes: item.attributes ?? null,
    rating: item.rating?.value ?? null,
    reviewCount: item.rating?.votes_count ?? 0,
  };
}

export type GridScanPointResult = {
  lat: number;
  lng: number;
  position: number | null;
  businessName: string | null;
};

// Every point is a real, billable DataForSEO SERP call - firing all of
// them at once (a 7x7 grid is 49 simultaneous requests) risks tripping
// DataForSEO's own rate limits and makes one bad point take down the
// whole scan's timing. Same wave-batching approach as the Site Audit
// crawler's concurrency cap (apps/worker/src/features/crawler.ts).
const GRID_SCAN_CONCURRENCY = 5;

// Shared real orchestration for "check a keyword's local-pack rank at
// every point in a grid, matched against one business's name" - used by
// both the on-demand grid-scan API route and the weekly scheduled worker
// job, so the two call sites can never drift into checking rank
// differently. Pure DataForSEO orchestration only, no DB access - each
// caller does its own persistence.
export async function runGridScanPoints(
  keyword: string,
  businessName: string,
  points: { lat: number; lng: number }[],
): Promise<GridScanPointResult[]> {
  const nameNeedle = businessName.trim().toLowerCase();
  const checkPoint = async (point: { lat: number; lng: number }): Promise<GridScanPointResult> => {
    const packResults = await getLocalPackResultsAtCoordinate(keyword, point.lat, point.lng);
    const match = nameNeedle ? packResults.find((r) => r.businessName.toLowerCase().includes(nameNeedle)) : undefined;
    return {
      lat: point.lat,
      lng: point.lng,
      position: match?.position ?? null,
      businessName: match?.businessName ?? null,
    };
  };

  const results: GridScanPointResult[] = [];
  for (let i = 0; i < points.length; i += GRID_SCAN_CONCURRENCY) {
    const batch = points.slice(i, i + GRID_SCAN_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(checkPoint))));
  }
  return results;
}
