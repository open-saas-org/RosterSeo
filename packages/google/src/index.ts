// GSC + GA4 OAuth flow, incremental sync, and quota-aware pagination.
// See ARCHITECTURE.md, Month 3, and PRD Section 5.6 for the constraints
// this package is designed around (row/quota limits, ~2-3 day GSC
// reporting lag, incremental daily sync, token revocation).

export {
  isGoogleOAuthConfigured,
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  GoogleReauthRequiredError,
  encodeState,
  decodeState,
} from "./client";
export type { GoogleOAuthState } from "./client";
export { getSearchConsolePerformance, getSearchConsoleQueryPageBreakdown, getSearchConsolePageMetrics } from "./data";
export { fetchGscExactWindow } from "./gsc-window";
export type { GscExactWindowResult } from "./gsc-window";
export { listSearchConsoleSites } from "./search-console-sites";
export type { SearchConsoleSite } from "./search-console-sites";
export { listGA4Properties } from "./ga4-properties";
export type { Ga4Property } from "./ga4-properties";
export { getGA4OrganicTrend, getGA4TopLandingPages, getGA4DeviceBreakdown, getGA4CountryBreakdown, getGA4PageMetrics } from "./ga4-performance";
export { fetchPageSpeedMetrics } from "./pagespeed";
export type { PageSpeedMetrics } from "./pagespeed";
export {
  listBusinessAccounts,
  listBusinessLocations,
  getLocationPerformance,
  GoogleBusinessProfileNotApprovedError,
} from "./business-profile";
export type { BusinessAccount, BusinessLocation, LocationPerformanceRow } from "./business-profile";
export {
  listMerchantAccounts,
  getMerchantProductPerformance,
  getMerchantProductPerformanceForProduct,
  registerMerchantApiDeveloper,
} from "./merchant-center";
export type { MerchantAccount, MerchantPerformanceRow } from "./merchant-center";
export { getGmailAddress } from "./gmail-oauth";
export { sendGmail } from "./gmail-send";
export type {
  GoogleService,
  GoogleTokens,
  SearchConsoleRow,
  GA4OrganicTrendRow,
  GA4LandingPageRow,
  GA4DeviceRow,
  GA4CountryRow,
  SearchConsolePageMetrics,
  SearchConsolePageQueryRow,
  GA4PageMetrics,
} from "./types";
