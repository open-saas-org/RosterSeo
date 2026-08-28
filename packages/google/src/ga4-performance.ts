import { google } from "googleapis";
import type { analyticsdata_v1beta } from "googleapis";
import type { GA4CountryRow, GA4DeviceRow, GA4LandingPageRow, GA4OrganicTrendRow, GA4PageMetrics } from "./types";

// Real Analytics Data API `runReport` calls, both scoped to Organic Search
// traffic specifically (not a general-purpose GA4 dashboard) - this is an
// SEO tool, so what matters is "how is search-driven traffic performing,"
// not every acquisition channel. `sessionDefaultChannelGroup` is GA4's
// standard channel-grouping dimension; "Organic Search" requires no custom
// event setup. No extra OAuth scope needed - `analytics.readonly`
// (already requested for GA4 connect, see client.ts's SCOPES) covers the
// Data API same as it covers the Admin API `listGA4Properties()` uses.

const ORGANIC_SEARCH_FILTER: analyticsdata_v1beta.Schema$FilterExpression = {
  filter: {
    fieldName: "sessionDefaultChannelGroup",
    stringFilter: { value: "Organic Search", matchType: "EXACT" },
  },
};

function client(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.analyticsdata({ version: "v1beta", auth });
}

function metricValue(row: analyticsdata_v1beta.Schema$Row, index: number): number {
  return Number(row.metricValues?.[index]?.value ?? 0);
}

export async function getGA4OrganicTrend(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<GA4OrganicTrendRow[]> {
  const analyticsdata = client(accessToken);
  const res = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensionFilter: ORGANIC_SEARCH_FILTER,
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
  });

  return (res.data.rows ?? []).map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    // GA4 returns dates as "YYYYMMDD" with no separators.
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      sessions: metricValue(row, 0),
      engagedSessions: metricValue(row, 1),
      averageSessionDuration: metricValue(row, 2),
      conversions: metricValue(row, 3),
    };
  });
}

export async function getGA4TopLandingPages(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 25,
): Promise<GA4LandingPageRow[]> {
  const analyticsdata = client(accessToken);
  const res = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensionFilter: ORGANIC_SEARCH_FILTER,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
    },
  });

  return (res.data.rows ?? []).map((row) => ({
    landingPage: row.dimensionValues?.[0]?.value ?? "",
    sessions: metricValue(row, 0),
    engagementRate: metricValue(row, 1),
    averageSessionDuration: metricValue(row, 2),
    conversions: metricValue(row, 3),
  }));
}

// Real GA4 Organic Search metrics scoped to exactly one page path (via a
// pagePath EXACT dimensionFilter, not client-side filtering of the top-25
// landing pages) - for Page Analyzer's "how has this specific page
// actually performed" section. Returns null when GA4 has zero rows for
// that exact path in the window (a real "no organic sessions", not an
// error) - never fabricated.
export async function getGA4PageMetrics(
  accessToken: string,
  propertyId: string,
  pagePath: string,
  startDate: string,
  endDate: string,
): Promise<GA4PageMetrics | null> {
  const analyticsdata = client(accessToken);
  const res = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensionFilter: {
        andGroup: {
          expressions: [ORGANIC_SEARCH_FILTER, { filter: { fieldName: "pagePath", stringFilter: { value: pagePath, matchType: "EXACT" } } }],
        },
      },
      limit: "1",
    },
  });

  const row = res.data.rows?.[0];
  if (!row) return null;

  return {
    sessions: metricValue(row, 0),
    screenPageViews: metricValue(row, 1),
    engagementRate: metricValue(row, 2),
    averageSessionDuration: metricValue(row, 3),
    conversions: metricValue(row, 4),
  };
}

// Real device-category split (desktop/mobile/tablet) of Organic Search
// traffic - low mobile engagement on a site with mostly mobile organic
// traffic is a real, actionable signal a single blended number hides.
export async function getGA4DeviceBreakdown(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<GA4DeviceRow[]> {
  const analyticsdata = client(accessToken);
  const res = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensionFilter: ORGANIC_SEARCH_FILTER,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
  });

  return (res.data.rows ?? []).map((row) => ({
    device: row.dimensionValues?.[0]?.value ?? "",
    sessions: metricValue(row, 0),
    engagementRate: metricValue(row, 1),
    averageSessionDuration: metricValue(row, 2),
    conversions: metricValue(row, 3),
  }));
}

// Real top countries for Organic Search traffic - which real geographies
// are actually finding the site through search, useful for deciding where
// local/international SEO investment is (or isn't) working.
export async function getGA4CountryBreakdown(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 25,
): Promise<GA4CountryRow[]> {
  const analyticsdata = client(accessToken);
  const res = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "country" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
      dimensionFilter: ORGANIC_SEARCH_FILTER,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
    },
  });

  return (res.data.rows ?? []).map((row) => ({
    country: row.dimensionValues?.[0]?.value ?? "",
    sessions: metricValue(row, 0),
    engagementRate: metricValue(row, 1),
    averageSessionDuration: metricValue(row, 2),
    conversions: metricValue(row, 3),
  }));
}
