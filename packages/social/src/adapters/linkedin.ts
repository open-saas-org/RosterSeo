import type { SocialAdapter } from "../types";

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
};
