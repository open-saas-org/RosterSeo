import { google } from "googleapis";

// Backlink Outreach's Gmail connect uses the same OAuth client/state/
// callback as GSC/GA4/GBP/Merchant (service: "gmail" in client.ts's
// GoogleService/SCOPES) - this file only holds the one thing specific to
// Gmail: looking up the real connected address right after consent, since
// Gmail's send-as header must match the authenticated account (or a
// verified alias), so this is what email_connections.fromEmail gets set
// to at connect time, not something the user types in.
export async function getGmailAddress(accessToken: string): Promise<string> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Google didn't return an email address for this account");
  return data.email;
}
