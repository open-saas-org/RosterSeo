import type { SocialAdapter } from "../types";

// Facebook Graph API - accountIdentifier is the Page ID; credentials.accessToken
// is the Page's own long-lived access token (obtained via the /me/accounts
// step during OAuth - see oauth.ts's exchangeMetaCode). mediaUrls[0], if
// present, is attached as a link rather than an uploaded photo - keeps this
// to one real API call instead of a separate photo-upload flow.
const GRAPH_VERSION = "v25.0";

interface FacebookFeedPost {
  id: string;
}

export const facebookPageAdapter: SocialAdapter = {
  platform: "facebook_page",
  async verify(credentials, accountIdentifier) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}?fields=id&access_token=${encodeURIComponent(credentials.pageAccessToken!)}`);
    if (!res.ok) throw new Error(`Facebook returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    const params = new URLSearchParams({ message: post.text, access_token: credentials.pageAccessToken! });
    if (post.mediaUrls[0]) params.set("link", post.mediaUrls[0]);
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}/feed`, { method: "POST", body: params });
    if (!res.ok) throw new Error(`Facebook returned HTTP ${res.status}`);
    const data = (await res.json()) as FacebookFeedPost;
    return { remoteId: data.id, remoteUrl: `https://www.facebook.com/${data.id}` };
  },
};
