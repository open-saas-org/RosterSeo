import type { SocialAdapter, SocialPostMetrics } from "../types";

// Instagram Content Publishing API (Business Login) - accountIdentifier is
// the Instagram Business Account ID. Two-step publish (create a media
// container, then publish it) same as Meta's own docs; Instagram fetches
// the image itself from image_url - no byte upload needed on our end. An
// extra GET for `permalink` gets the real public URL (the id returned by
// media_publish is not itself a usable link).
const GRAPH_VERSION = "v25.0";

interface MediaContainer {
  id: string;
}

export const instagramAdapter: SocialAdapter = {
  platform: "instagram",
  async verify(credentials, accountIdentifier) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}?fields=id,username&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    if (!res.ok) throw new Error(`Instagram returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    if (post.mediaUrls.length === 0) throw new Error("Instagram posts need at least one image");

    const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: post.mediaUrls[0]!, caption: post.text, access_token: credentials.accessToken! }),
    });
    if (!createRes.ok) throw new Error(`Instagram returned HTTP ${createRes.status}`);
    const container = (await createRes.json()) as MediaContainer;

    const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: credentials.accessToken! }),
    });
    if (!publishRes.ok) throw new Error(`Instagram returned HTTP ${publishRes.status}`);
    const published = (await publishRes.json()) as MediaContainer;

    const permalinkRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${published.id}?fields=permalink&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    const permalink = permalinkRes.ok ? ((await permalinkRes.json()) as { permalink?: string }).permalink : undefined;

    return { remoteId: published.id, remoteUrl: permalink ?? `https://www.instagram.com/` };
  },
  // `impressions` is deliberately NOT fetched - Meta deprecated that
  // metric for most media created after mid-2023, so requesting it
  // returns an error on current accounts rather than a real number; left
  // undefined rather than guessed at. `shares`/`clicks` have no public
  // Instagram media-insights equivalent at all. Unverified against a live
  // funded account in this environment.
  async fetchMetrics(credentials, remotePostId) {
    const token = credentials.accessToken!;
    const [fieldsRes, insightsRes] = await Promise.all([
      fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${remotePostId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`),
      fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${remotePostId}/insights?metric=reach&access_token=${encodeURIComponent(token)}`),
    ]);

    const metrics: SocialPostMetrics = {};

    if (fieldsRes.ok) {
      const fields = (await fieldsRes.json()) as { like_count?: number; comments_count?: number };
      metrics.likes = fields.like_count;
      metrics.comments = fields.comments_count;
    }

    if (insightsRes.ok) {
      const insights = (await insightsRes.json()) as { data?: { name: string; values: { value: number }[] }[] };
      metrics.reach = insights.data?.find((d) => d.name === "reach")?.values[0]?.value;
    }

    return metrics;
  },
};
