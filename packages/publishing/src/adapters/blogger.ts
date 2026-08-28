import type { BlogAdapter } from "../types";

// Blogger API v3 - Google OAuth2. GATED (see the plan's platform tiering:
// Google requires sensitive-scope verification once past test users) -
// the Connect button ships disabled until that clears, so this adapter
// only ever runs against an operator's own manually-verified test
// connection for now. Uses a plain accessToken (no refresh-token rotation
// wired up yet - not worth building until the platform is actually
// connectable end to end).
interface BloggerPost {
  id: string;
  url: string;
}

export const bloggerAdapter: BlogAdapter = {
  platform: "blogger",
  async verify(credentials, siteIdentifier) {
    const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${siteIdentifier}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Google rejected that access token" : `Blogger returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${siteIdentifier}/posts/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: post.title, content: post.html, labels: post.tags }),
    });
    if (!res.ok) throw new Error(`Blogger returned HTTP ${res.status}`);
    const data = (await res.json()) as BloggerPost;
    return { remoteId: data.id, remoteUrl: data.url };
  },
};
