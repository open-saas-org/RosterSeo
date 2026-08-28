import type { BlogAdapter } from "../types";

// Webflow CMS API v2 - a per-site API token (not the public marketplace
// OAuth app, see the plan's platform tiering). siteIdentifier is the Blog
// Posts collection ID (Webflow blog posts are just CMS collection items -
// there's no separate "posts" endpoint). Field names (name/post-body) match
// Webflow's default Blog Posts collection schema.
interface WebflowItem {
  id: string;
}

export const webflowAdapter: BlogAdapter = {
  platform: "webflow",
  async verify(credentials, siteIdentifier) {
    const token = credentials.accessToken || credentials.apiToken;
    const res = await fetch(`https://api.webflow.com/v2/collections/${siteIdentifier}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Webflow rejected that API token" : `Webflow returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const token = credentials.accessToken || credentials.apiToken;
    const res = await fetch(`https://api.webflow.com/v2/collections/${siteIdentifier}/items?live=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: false, isDraft: false, fieldData: { name: post.title, slug: slugify(post.title), "post-body": post.html } }),
    });
    if (!res.ok) throw new Error(`Webflow returned HTTP ${res.status}`);
    const data = (await res.json()) as WebflowItem;
    return { remoteId: data.id, remoteUrl: `https://webflow.com/dashboard/sites?collectionItem=${data.id}` };
  },
};

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
