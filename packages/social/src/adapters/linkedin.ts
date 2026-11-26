import type { SocialAdapter, SocialPostMetrics } from "../types";

// LinkedIn Posts API - accountIdentifier is the member's real "sub" (person
// URN id) from /v2/userinfo at connect time, used in the required
// author=urn:li:person:{sub} field. LinkedIn-Version must be a real
// YYYYMM string per their docs.
const LINKEDIN_VERSION = "202501";

export const linkedinAdapter: SocialAdapter = {
  platform: "linkedin",
  async verify(credentials) {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (!res.ok) throw new Error(res.status === 401 ? "LinkedIn rejected that access token" : `LinkedIn returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${accountIdentifier}`,
        commentary: post.text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn returned HTTP ${res.status}`);
    const id = res.headers.get("x-restli-id") ?? "";
    return { remoteId: id, remoteUrl: `https://www.linkedin.com/feed/update/${id}` };
  },
  // IMPORTANT, verify against current LinkedIn docs before relying on this
  // in production: LinkedIn's "Organic Share Statistics API" (impressions/
  // clicks/shares, PUBLISHING_PLATFORM_PRD.md §3's original assumption)
  // is scoped to ORGANIZATION-authored posts only. This adapter's publish()
  // above posts as a PERSON (author=urn:li:person:...), so that endpoint
  // does not apply to anything this app ever publishes - there is no
  // public LinkedIn equivalent for personal-share impressions/clicks. This
  // instead calls the Social Actions API (`/v2/socialActions/{urn}`),
  // which does cover member shares for likes/comments counts - the
  // response field names below (likesSummary.totalLikes,
  // commentsSummary.aggregatedTotalComments) are from LinkedIn's published
  // schema as of this writing but NOT live-tested against a real token in
  // this environment; double-check them against current docs before
  // shipping. `impressions`/`shares`/`clicks` are left undefined (not 0)
  // for LinkedIn always - a real platform limitation, not a gap here.
  async fetchMetrics(credentials, remotePostId) {
    const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(remotePostId)}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) return {};

    const data = (await res.json()) as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { aggregatedTotalComments?: number };
    };

    const metrics: SocialPostMetrics = {
      likes: data.likesSummary?.totalLikes,
      comments: data.commentsSummary?.aggregatedTotalComments,
    };
    return metrics;
  },
};
