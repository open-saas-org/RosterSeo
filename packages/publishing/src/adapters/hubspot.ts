import type { BlogAdapter } from "../types";

// HubSpot CMS/Content Hub Blog Posts API - a private-app access token
// (no public marketplace review needed below ~10 installs, see the plan's
// platform tiering). siteIdentifier is the target blog's contentGroupId.
interface HubSpotPost {
  id: string;
  url?: string;
}

export const hubspotAdapter: BlogAdapter = {
  platform: "hubspot",
  async verify(credentials, siteIdentifier) {
    const res = await fetch(`https://api.hubapi.com/cms/v3/blogs/blogs/${siteIdentifier}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "HubSpot rejected that access token" : `HubSpot returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const res = await fetch("https://api.hubapi.com/cms/v3/blogs/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: post.title, contentGroupId: siteIdentifier, postBody: post.html, state: "PUBLISHED" }),
    });
    if (!res.ok) throw new Error(`HubSpot returned HTTP ${res.status}`);
    const data = (await res.json()) as HubSpotPost;
    return { remoteId: data.id, remoteUrl: data.url ?? "" };
  },
};
