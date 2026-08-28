import { google } from "googleapis";

export interface Ga4Property {
  propertyId: string; // "properties/123456"
  displayName: string;
  accountName: string;
}

// Real Analytics Admin API `accountSummaries.list` call - one request
// returns every account the user can access plus each account's GA4
// properties nested underneath, which is enough for a flat picker without
// walking accounts.list() + properties.list() separately. No extra OAuth
// scope needed: `analytics.readonly` (already requested for GA4 connect,
// see client.ts's SCOPES) covers Admin API reads, not just the Data API.
export async function listGA4Properties(accessToken: string): Promise<Ga4Property[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const analyticsadmin = google.analyticsadmin({ version: "v1beta", auth });
  const res = await analyticsadmin.accountSummaries.list({ pageSize: 200 });

  const properties: Ga4Property[] = [];
  for (const account of res.data.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      properties.push({
        propertyId: property.property,
        displayName: property.displayName ?? property.property,
        accountName: account.displayName ?? "",
      });
    }
  }
  return properties;
}
