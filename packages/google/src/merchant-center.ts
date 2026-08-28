import { google } from "googleapis";

// Google Merchant Center via the new **Merchant API** (`merchantapi.googleapis.com`)
// - the old Content API for Shopping (`content.googleapis.com`) this file
// originally targeted is being sunset; Google Cloud Console now points new
// projects at the Merchant API instead, confirmed live this session
// ("Content API for Shopping has not been used... " pointed at the
// Merchant API enablement page). Same OAuth scope as before
// (`https://www.googleapis.com/auth/content`, per the SDK's own real
// request examples) - no scope/reconnect needed for existing connections.
//
// Real, inspected-from-the-installed-SDK shapes (googleapis' generated
// `merchantapi` client, `accounts_v1` + `reports_v1`), not yet live-tested
// end-to-end against a real Merchant Center account.

export interface MerchantAccount {
  /** Resource name, e.g. "accounts/123456" - what `parent` on the Reports API needs. */
  id: string;
  accountId: string;
  name: string;
}

export interface MerchantPerformanceRow {
  date: string; // ISO yyyy-mm-dd
  clicks: number;
  impressions: number;
  ctr: number;
  conversions: number;
}

function authClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

// accounts.list - real Merchant API method (Accounts sub-API,
// `merchantapi('accounts_v1')`), replacing the old Content API's
// `accounts.authinfo`. Lists every account the token can access.
export async function listMerchantAccounts(accessToken: string): Promise<MerchantAccount[]> {
  const auth = authClient(accessToken);
  const merchantapi = google.merchantapi({ version: "accounts_v1", auth });
  const res = await merchantapi.accounts.list({});
  return (res.data.accounts ?? [])
    .filter((a) => a.name)
    .map((a) => ({
      id: a.name!,
      accountId: a.accountId ?? a.name!.replace(/^accounts\//, ""),
      name: a.accountName ?? a.name!,
    }));
}

// developerRegistration.registerGcp - the real, one-time Merchant API
// bootstrap call: a GCP project must be registered as an `API_DEVELOPER`
// on a Merchant Center account before accounts.list() (and everything
// else) will work - Google returns a real 401 "GCP project ... is not
// registered with the merchant account" otherwise.
//
// getAccountForGcpRegistration is NOT a pre-registration discovery call
// despite its name - confirmed live this session, it 401s with the exact
// same "not registered" error when called first. Per its own description
// ("the merchant account that the GCP is registered with"), it's a
// post-registration STATUS check, so there's nothing for it to find until
// registerGcp has already run once - hence the account resource name has
// to come from the caller (the numeric Merchant Center account ID, found
// in the Merchant Center URL or account switcher), not auto-discovered.
export async function registerMerchantApiDeveloper(accessToken: string, merchantAccountId: string, developerEmail: string): Promise<string> {
  const auth = authClient(accessToken);
  const merchantapi = google.merchantapi({ version: "accounts_v1", auth });

  const accountName = `accounts/${merchantAccountId}`;
  await merchantapi.accounts.developerRegistration.registerGcp({
    name: `${accountName}/developerRegistration`,
    requestBody: { developerEmail },
  });

  return accountName;
}

function isoDateFromReportDate(d: { year?: number | null; month?: number | null; day?: number | null } | undefined): string | null {
  if (!d?.year || !d.month || !d.day) return null;
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

// accounts.reports.search - real Merchant API Reports sub-API
// (`merchantapi('reports_v1')`), a SQL-like query language over
// `product_performance_view` (see Google's Reports query-language guide).
// Not yet live-tested - the query string below is built from the
// documented table/column names, worth a spot-check against a real
// account once one is connected.
export async function getMerchantProductPerformance(
  accessToken: string,
  accountResourceName: string,
  startDate: string,
  endDate: string,
): Promise<MerchantPerformanceRow[]> {
  const auth = authClient(accessToken);
  const merchantapi = google.merchantapi({ version: "reports_v1", auth });

  const query = `SELECT date, clicks, impressions, click_through_rate, conversions FROM product_performance_view WHERE date BETWEEN '${startDate}' AND '${endDate}'`;

  const rows: MerchantPerformanceRow[] = [];
  let pageToken: string | undefined;
  do {
    const res = await merchantapi.accounts.reports.search({
      parent: accountResourceName,
      requestBody: { query, pageSize: 1000, pageToken },
    });
    for (const row of res.data.results ?? []) {
      const view = row.productPerformanceView;
      const date = isoDateFromReportDate(view?.date);
      if (!date) continue;
      rows.push({
        date,
        clicks: Number(view?.clicks ?? 0),
        impressions: Number(view?.impressions ?? 0),
        ctr: view?.clickThroughRate ?? 0,
        conversions: view?.conversions ?? 0,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // The query above is per-product (offer_id is an implicit segment even
  // though it's not selected), so multiple rows can share the same date -
  // aggregate to one row per day for the trend chart/table.
  const byDate = new Map<string, MerchantPerformanceRow>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { ...row });
    } else {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.conversions += row.conversions;
    }
  }
  return [...byDate.values()]
    .map((row) => ({ ...row, ctr: row.impressions > 0 ? row.clicks / row.impressions : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Page Analyzer's per-product cross-reference: unlike
// getMerchantProductPerformance above (whole-account totals across every
// product), this filters the same Reports query language down to ONE real
// product - matched by its real declared name (e.g. from the analyzed
// page's own JSON-LD Product schema), not a stored offer_id mapping this
// app doesn't have, since that's the only real link available between "the
// page Page Analyzer just crawled" and "a row in this Merchant account's
// catalog." The title filter runs server-side in the query itself (not a
// client-side scan-and-match over every product) so a large catalog
// doesn't turn one page analysis into a slow full-account pull. Real rows
// only - an empty array is an honest "no matching product in this account
// (or zero traffic in this window)," never fabricated.
export async function getMerchantProductPerformanceForProduct(
  accessToken: string,
  accountResourceName: string,
  productName: string,
  startDate: string,
  endDate: string,
): Promise<MerchantPerformanceRow[]> {
  const auth = authClient(accessToken);
  const merchantapi = google.merchantapi({ version: "reports_v1", auth });

  // Basic quote-escaping for the query-language string literal (this is
  // Google's Reports query language against the caller's own linked
  // Merchant account, not SQL against this app's DB - still worth escaping
  // for correctness, since a product title can contain an apostrophe).
  const escapedTitle = productName.trim().replace(/'/g, "''");
  const query = `SELECT date, clicks, impressions, click_through_rate, conversions FROM product_performance_view WHERE date BETWEEN '${startDate}' AND '${endDate}' AND title = '${escapedTitle}'`;

  const rows: MerchantPerformanceRow[] = [];
  let pageToken: string | undefined;
  do {
    const res = await merchantapi.accounts.reports.search({
      parent: accountResourceName,
      requestBody: { query, pageSize: 1000, pageToken },
    });
    for (const row of res.data.results ?? []) {
      const view = row.productPerformanceView;
      const date = isoDateFromReportDate(view?.date);
      if (!date) continue;
      rows.push({
        date,
        clicks: Number(view?.clicks ?? 0),
        impressions: Number(view?.impressions ?? 0),
        ctr: view?.clickThroughRate ?? 0,
        conversions: view?.conversions ?? 0,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const byDate = new Map<string, MerchantPerformanceRow>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { ...row });
    } else {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.conversions += row.conversions;
    }
  }
  return [...byDate.values()]
    .map((row) => ({ ...row, ctr: row.impressions > 0 ? row.clicks / row.impressions : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
