import type { SocialAdapter } from "../types";

// X (Twitter) API v2 - real, but the only platform here with a hard
// per-post monetary cost from day one (no free tier as of the pricing
// change effective Feb 2026) - gated in the registry with a cost warning,
// not a "pending approval" one. accountIdentifier isn't needed by the API
// itself (the token identifies the account), kept only for display.
interface XTweetResponse {
  data: { id: string };
}

export const xAdapter: SocialAdapter = {
  platform: "x",
  async verify(credentials) {
    const res = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (!res.ok) throw new Error(res.status === 401 ? "X rejected that access token" : `X returned HTTP ${res.status}`);
  },
  async publish(credentials, _accountIdentifier, post) {
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: post.text }),
    });
    if (!res.ok) throw new Error(`X returned HTTP ${res.status}`);
    const data = (await res.json()) as XTweetResponse;
    return { remoteId: data.data.id, remoteUrl: `https://x.com/i/web/status/${data.data.id}` };
  },
};
