// Shared types for the Google integration package (GSC + GA4 OAuth + data reads).

// "gmail" is Backlink Outreach's send-as-you connection - shares this same
// OAuth client/callback/redirect-uri plumbing (see client.ts's SCOPES and
// the callback route's own comment) rather than standing up a second,
// separately-registered redirect URI for one more service.
export type GoogleService = "gsc" | "ga4" | "gbp" | "merchant" | "gmail";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry time for the access token. */
  expiresAt: Date;
}

export interface SearchConsoleRow {
  date: string; // YYYY-MM-DD
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GA4OrganicTrendRow {
  date: string; // YYYY-MM-DD
  sessions: number;
  engagedSessions: number;
  averageSessionDuration: number; // seconds
  conversions: number;
}

export interface GA4LandingPageRow {
  landingPage: string;
  sessions: number;
  engagementRate: number; // 0-1
  averageSessionDuration: number; // seconds
  conversions: number;
}

export interface GA4DeviceRow {
  device: string; // "desktop" | "mobile" | "tablet" | "smart tv" (GA4's own deviceCategory values)
  sessions: number;
  engagementRate: number; // 0-1
  averageSessionDuration: number; // seconds
  conversions: number;
}

export interface GA4CountryRow {
  country: string;
  sessions: number;
  engagementRate: number; // 0-1
  averageSessionDuration: number; // seconds
  conversions: number;
}

export interface SearchConsolePageQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// Real Search Console metrics for exactly one URL - not a site-wide
// aggregate. `topQueries` is real, sorted by clicks; the totals are summed
// from the same real rows GSC returned (impression-weighted average
// position), never estimated.
export interface SearchConsolePageMetrics {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: SearchConsolePageQueryRow[];
}

// Real GA4 Organic Search metrics for exactly one page path - null when GA4
// has zero rows for that exact path in the window (never estimated/faked).
export interface GA4PageMetrics {
  sessions: number;
  screenPageViews: number;
  engagementRate: number; // 0-1
  averageSessionDuration: number; // seconds
  conversions: number;
}
