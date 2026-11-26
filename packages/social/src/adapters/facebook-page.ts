import type { SocialAdapter, SocialPostMetrics } from "../types";

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
  // Two real calls: the post's own `likes`/`comments`/`shares` fields
  // (summary totals, not the individual reaction/comment objects - no
  // need to paginate those just for a count), and the post-level Insights
  // edge for impressions/reach/clicks (these are NOT available as plain
  // fields on the post object, only via /insights). Unverified against a
  // live funded Page in this environment - field/metric names are per
  // Meta's published Graph API docs as of this writing, not live-tested.
  async fetchMetrics(credentials, remotePostId) {
    const token = credentials.pageAccessToken!;
    const [fieldsRes, insightsRes] = await Promise.all([
      fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${remotePostId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(token)}`,
      ),
      fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${remotePostId}/insights?metric=post_impressions,post_impressions_unique,post_clicks&access_token=${encodeURIComponent(token)}`,
      ),
    ]);

    const metrics: SocialPostMetrics = {};

    if (fieldsRes.ok) {
      const fields = (await fieldsRes.json()) as {
        likes?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
      };
      metrics.likes = fields.likes?.summary?.total_count;
      metrics.comments = fields.comments?.summary?.total_count;
      metrics.shares = fields.shares?.count;
    }

    if (insightsRes.ok) {
      const insights = (await insightsRes.json()) as { data?: { name: string; values: { value: number }[] }[] };
      for (const metric of insights.data ?? []) {
        const value = metric.values[0]?.value;
        if (metric.name === "post_impressions") metrics.impressions = value;
        if (metric.name === "post_impressions_unique") metrics.reach = value;
        if (metric.name === "post_clicks") metrics.clicks = value;
      }
    }

    return metrics;
  },
};
