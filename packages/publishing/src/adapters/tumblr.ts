import type { BlogAdapter } from "../types";

// Tumblr API v2, OAuth2 access token, NPF (Neue Post Format). NPF text
// blocks are plain text, not HTML - the incoming post.html is stripped of
// tags for the body block (a real HTML->NPF-rich-text mapping is a bigger
// job than v1 needs; this is an honest MVP simplification, not a bug).
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface TumblrCreateResponse {
  response: { id: number; post_url?: string };
}

export const tumblrAdapter: BlogAdapter = {
  platform: "tumblr",
  async verify(credentials, siteIdentifier) {
    const res = await fetch(`https://api.tumblr.com/v2/blog/${encodeURIComponent(siteIdentifier)}/info`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Tumblr rejected that access token" : `Tumblr returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const res = await fetch(`https://api.tumblr.com/v2/blog/${encodeURIComponent(siteIdentifier)}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: [
          { type: "text", text: post.title, subtype: "heading1" },
          { type: "text", text: stripHtml(post.html) },
        ],
        tags: post.tags.join(","),
      }),
    });
    if (!res.ok) throw new Error(`Tumblr returned HTTP ${res.status}`);
    const data = (await res.json()) as TumblrCreateResponse;
    const id = String(data.response.id);
    return { remoteId: id, remoteUrl: data.response.post_url ?? `https://${siteIdentifier}/post/${id}` };
  },
};
