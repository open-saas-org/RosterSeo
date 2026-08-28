import { google } from "googleapis";

// Real Google Business Profile OAuth wrapper - kept as available plumbing
// for a future GBP-connected feature, even though today's Local SEO module
// (Profile/Monitor/Optimize) runs on DataForSEO's Business Data API
// instead (no OAuth/approval needed, see @seo-tool/dataforseo's
// getBusinessListingDetails). This file's own connect card lives on the
// Integrations page independently of Local SEO.
//
// Production access to these REST APIs needs a *manual approval* from
// Google (an access-request form, needs a GBP location verified 60+ days,
// unknown review turnaround) - unlike GSC/GA4's self-serve "sensitive
// scope" review. The OAuth *connect* flow works immediately once
// GOOGLE_OAUTH_CLIENT_ID/SECRET are set; real accounts/locations-listing
// calls will fail with GoogleBusinessProfileNotApprovedError until Google
// approves the project.

export interface BusinessAccount {
  name: string; // "accounts/{id}"
  accountName: string;
}

export interface BusinessLocation {
  name: string; // "locations/{id}"
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LocationPerformanceRow {
  date: string; // YYYY-MM-DD
  views: number;
  calls: number;
  chats: number;
  bookings: number;
  directionRequests: number;
  websiteClicks: number;
  menuClicks: number;
}

// Confirmed live this session: Google's real pre-approval rejection is an
// HTTP 429 "Quota exceeded for quota metric 'Requests'..." response, not a
// 403 as originally assumed - matching on message content rather than
// status code is what actually catches it.
export class GoogleBusinessProfileNotApprovedError extends Error {
  constructor(message = "Google Business Profile API access hasn't been approved for this project yet.") {
    super(message);
  }
}

function isNotApprovedError(err: unknown): boolean {
  const message = (err as { message?: string })?.message ?? "";
  return /quota exceeded|permission_denied|not been approved|caller does not have permission/i.test(message);
}

function authClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

export async function listBusinessAccounts(accessToken: string): Promise<BusinessAccount[]> {
  const auth = authClient(accessToken);
  const mybusinessaccountmanagement = google.mybusinessaccountmanagement({ version: "v1", auth });
  try {
    const res = await mybusinessaccountmanagement.accounts.list();
    return (res.data.accounts ?? [])
      .filter((a) => a.name)
      .map((a) => ({ name: a.name!, accountName: a.accountName ?? a.name! }));
  } catch (err) {
    if (isNotApprovedError(err)) throw new GoogleBusinessProfileNotApprovedError();
    throw err;
  }
}

export async function listBusinessLocations(accessToken: string, accountName: string): Promise<BusinessLocation[]> {
  const auth = authClient(accessToken);
  const mybusinessbusinessinformation = google.mybusinessbusinessinformation({ version: "v1", auth });
  try {
    const res = await mybusinessbusinessinformation.accounts.locations.list({
      parent: accountName,
      readMask: "name,title,storefrontAddress,latlng",
      pageSize: 100,
    });
    return (res.data.locations ?? [])
      .filter((l) => l.name)
      .map((l) => ({
        name: l.name!,
        title: l.title ?? l.name!,
        address: l.storefrontAddress?.addressLines?.join(", ") ?? null,
        lat: l.latlng?.latitude ?? null,
        lng: l.latlng?.longitude ?? null,
      }));
  } catch (err) {
    if (isNotApprovedError(err)) throw new GoogleBusinessProfileNotApprovedError();
    throw err;
  }
}

type MetricField = "views" | "calls" | "chats" | "bookings" | "directionRequests" | "websiteClicks" | "menuClicks";

// Google's own documented DailyMetric enum for the Business Profile
// Performance API - not yet live-tested (production access is still
// pending Google's approval, see the module-level note above), so these
// exact string values should be spot-checked against a real response
// once approval lands and a live call becomes possible, same as
// isNotApprovedError()'s regex was tuned from a real error only after
// testing against a real account.
const METRIC_KEY: Record<string, MetricField> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "views",
  CALL_CLICKS: "calls",
  BUSINESS_CONVERSATIONS: "chats",
  BUSINESS_BOOKINGS: "bookings",
  BUSINESS_DIRECTION_REQUESTS: "directionRequests",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_FOOD_MENU_CLICKS: "menuClicks",
};

const EMPTY_ROW: Record<MetricField, number> = {
  views: 0,
  calls: 0,
  chats: 0,
  bookings: 0,
  directionRequests: 0,
  websiteClicks: 0,
  menuClicks: 0,
};

export async function getLocationPerformance(
  accessToken: string,
  locationName: string,
  startDate: Date,
  endDate: Date,
): Promise<LocationPerformanceRow[]> {
  const auth = authClient(accessToken);
  const businessprofileperformance = google.businessprofileperformance({ version: "v1", auth });
  try {
    const res = await businessprofileperformance.locations.fetchMultiDailyMetricsTimeSeries({
      location: locationName,
      dailyMetrics: Object.keys(METRIC_KEY),
      "dailyRange.startDate.year": startDate.getFullYear(),
      "dailyRange.startDate.month": startDate.getMonth() + 1,
      "dailyRange.startDate.day": startDate.getDate(),
      "dailyRange.endDate.year": endDate.getFullYear(),
      "dailyRange.endDate.month": endDate.getMonth() + 1,
      "dailyRange.endDate.day": endDate.getDate(),
    });

    const byDate = new Map<string, Record<MetricField, number>>();
    for (const series of res.data.multiDailyMetricTimeSeries ?? []) {
      for (const dailyMetricSeries of series.dailyMetricTimeSeries ?? []) {
        const key = METRIC_KEY[dailyMetricSeries.dailyMetric ?? ""];
        if (!key) continue;
        for (const point of dailyMetricSeries.timeSeries?.datedValues ?? []) {
          const d = point.date;
          if (!d?.year || !d.month || !d.day) continue;
          const dateStr = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
          const row = byDate.get(dateStr) ?? { ...EMPTY_ROW };
          row[key] = Number(point.value ?? 0);
          byDate.set(dateStr, row);
        }
      }
    }

    return Array.from(byDate.entries())
      .map(([date, row]) => ({ date, ...row }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    if (isNotApprovedError(err)) throw new GoogleBusinessProfileNotApprovedError();
    throw err;
  }
}
