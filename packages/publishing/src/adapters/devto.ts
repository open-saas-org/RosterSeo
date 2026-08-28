import type { BlogAdapter } from "../types";

// Dev.to (Forem) API - simple api-key header, markdown-native (so the
// canonical Markdown body is sent as-is, not converted to HTML). No
// siteIdentifier needed (an api-key maps to exactly one account), but the
// field is still shown in the connect form for the account/username label.
interface ForemArticle {
  id: number;
  url: string;
}

export const devtoAdapter: BlogAdapter = {
  platform: "devto",
  async verify(credentials) {
    const res = await fetch("https://dev.to/api/articles/me", {
      headers: { "api-key": credentials.apiKey!, "User-Agent": "seo-tool-publish" },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Dev.to rejected that API key" : `Dev.to returned HTTP ${res.status}`);
  },
  async publish(credentials, _siteIdentifier, post) {
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: { "api-key": credentials.apiKey!, "Content-Type": "application/json", "User-Agent": "seo-tool-publish" },
      body: JSON.stringify({ article: { title: post.title, body_markdown: post.markdown, published: true, tags: post.tags.slice(0, 4) } }),
    });
    if (!res.ok) throw new Error(`Dev.to returned HTTP ${res.status}`);
    const data = (await res.json()) as ForemArticle;
    return { remoteId: String(data.id), remoteUrl: data.url };
  },
};
