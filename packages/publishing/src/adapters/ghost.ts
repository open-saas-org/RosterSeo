import { createHmac } from "node:crypto";
import type { BlogAdapter } from "../types";

// Ghost Admin API - auth is a short-lived (5 min) HMAC-SHA256 JWT signed
// with the Admin API key's secret half, per Ghost's own documented scheme
// (https://ghost.org/docs/admin-api/#authentication). Hand-rolled via
// Node's crypto rather than adding a jsonwebtoken dependency - it's three
// base64url segments, not worth a library.
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signAdminApiJwt(adminApiKey: string): string {
  const [id, secret] = adminApiKey.split(":");
  if (!id || !secret) throw new Error("Ghost Admin API key must be in the form id:secret");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const payload = base64url(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }));
  const signature = base64url(createHmac("sha256", Buffer.from(secret, "hex")).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

interface GhostPost {
  id: string;
  url: string;
}

export const ghostAdapter: BlogAdapter = {
  platform: "ghost",
  async verify(credentials, siteIdentifier) {
    const res = await fetch(`${siteIdentifier.replace(/\/+$/, "")}/ghost/api/admin/site/`, {
      headers: { Authorization: `Ghost ${signAdminApiJwt(credentials.adminApiKey!)}` },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Ghost rejected that Admin API key" : `Ghost returned HTTP ${res.status}`);
  },
  async publish(credentials, siteIdentifier, post) {
    const res = await fetch(`${siteIdentifier.replace(/\/+$/, "")}/ghost/api/admin/posts/?source=html`, {
      method: "POST",
      headers: { Authorization: `Ghost ${signAdminApiJwt(credentials.adminApiKey!)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ posts: [{ title: post.title, html: post.html, status: "published", tags: post.tags.map((name) => ({ name })) }] }),
    });
    if (!res.ok) throw new Error(`Ghost returned HTTP ${res.status}`);
    const data = (await res.json()) as { posts: GhostPost[] };
    const created = data.posts[0]!;
    return { remoteId: created.id, remoteUrl: created.url };
  },
};
