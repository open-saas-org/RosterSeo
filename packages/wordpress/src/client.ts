import type { WordPressNewPost, WordPressPost } from "./types";

// WordPress REST API, authenticated with a real Application Password (WP
// core 5.6+, Users > Profile in the customer's own WP admin - no plugin,
// no OAuth). HTTP Basic Auth: username + application password, base64
// encoded, same as WordPress's own documented curl examples.

function basicAuthHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

interface WpApiPost {
  id: number;
  title: { rendered: string };
  link: string;
  status: string;
  date: string;
}

async function fetchPosts(siteUrl: string, username: string, appPassword: string, limit: number, timeoutMs = 15_000): Promise<WordPressPost[]> {
  const url = `${normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/posts?per_page=${limit}&status=publish,draft,future,pending`;
  const res = await fetch(url, {
    headers: { Authorization: basicAuthHeader(username, appPassword) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "WordPress rejected the username/application password" : `WordPress returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as WpApiPost[];
  return data.map((p) => ({ id: p.id, title: p.title.rendered, link: p.link, status: p.status, date: p.date }));
}

// Verification IS the first real posts call - a working authenticated
// request against the site's own REST API is the proof of a valid
// connection, no separate "ping" endpoint needed.
export async function verifyWordPressConnection(siteUrl: string, username: string, appPassword: string): Promise<void> {
  await fetchPosts(siteUrl, username, appPassword, 1);
}

export async function listRecentPosts(siteUrl: string, username: string, appPassword: string, limit = 5): Promise<WordPressPost[]> {
  return fetchPosts(siteUrl, username, appPassword, limit);
}

// Real write - used by Publish (packages/publishing's WordPress adapter),
// not by the read-only connection card above. Same Application Password
// auth, just a POST instead of a GET.
export async function createPost(siteUrl: string, username: string, appPassword: string, post: WordPressNewPost, timeoutMs = 20_000): Promise<{ id: string; url: string }> {
  const url = `${normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/posts`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(username, appPassword), "Content-Type": "application/json" },
    body: JSON.stringify({ title: post.title, content: post.content, status: post.status ?? "publish" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "WordPress rejected the username/application password" : `WordPress returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as WpApiPost;
  return { id: String(data.id), url: data.link };
}
