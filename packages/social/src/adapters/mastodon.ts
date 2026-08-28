import type { SocialAdapter } from "../types";

// Mastodon REST API - accountIdentifier is the instance base URL (e.g.
// "https://mastodon.social"), since posting is per-instance. The OAuth
// token itself is obtained via the dynamic per-instance app registration
// flow in oauth.ts, not here - this file only ever posts with an
// already-valid token.
interface MastodonStatus {
  id: string;
  url: string;
}

export const mastodonAdapter: SocialAdapter = {
  platform: "mastodon",
  async verify(credentials, accountIdentifier) {
    const res = await fetch(`${accountIdentifier.replace(/\/+$/, "")}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Mastodon rejected that access token" : `Mastodon returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    const res = await fetch(`${accountIdentifier.replace(/\/+$/, "")}/api/v1/statuses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: post.text }),
    });
    if (!res.ok) throw new Error(`Mastodon returned HTTP ${res.status}`);
    const data = (await res.json()) as MastodonStatus;
    return { remoteId: data.id, remoteUrl: data.url };
  },
};
