import { google } from "googleapis";

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

// Real Search Console `sites.list` call - the user's actual verified
// properties, for a real picker instead of asking them to type the exact
// property string blind. Filters out `siteUnverifiedUser` (pending
// verification, not usable for the Search Analytics API this app queries).
export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const res = await searchconsole.sites.list();

  return (res.data.siteEntry ?? [])
    .filter((site) => site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({
      siteUrl: site.siteUrl ?? "",
      permissionLevel: site.permissionLevel ?? "",
    }))
    .filter((site) => site.siteUrl);
}
