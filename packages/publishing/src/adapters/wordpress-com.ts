import type { BlogAdapter } from "../types";

// WordPress.com's own REST API (distinct from self-hosted WP's core REST
// API) - OAuth2 access token, https://developer.wordpress.com/docs/api/.
// siteIdentifier is the site's domain (e.g. "example.wordpress.com") or
// numeric site ID, either works as WordPress.com's own $site path param.
interface WpComPost {
  ID: number;
  URL: string;
}

export const wordpressComAdapter: BlogAdapter = {
  platform: "wordpress_com",
  async verify(credentials, siteIdentifier) {
    const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(siteIdentifier)}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "WordPress.com rejected that access token" : `WordPress.com returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(siteIdentifier)}/posts/new`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: post.title, content: post.html, status: "publish", tags: post.tags.join(",") }),
    });
    if (!res.ok) throw new Error(`WordPress.com returned HTTP ${res.status}`);
    const data = (await res.json()) as WpComPost;
    return { remoteId: String(data.ID), remoteUrl: data.URL };
  },
};
