import type { SocialAdapter } from "../types";

// AT Protocol (Bluesky) - App Password auth, not full OAuth. Bluesky's own
// OAuth is still a developer-preview DPoP flow (meaningfully more complex
// than a standard authorization-code exchange) and App Passwords remain
// fully supported (just "not recommended for new integrations" per their
// own docs, not deprecated) - a reasonable v1 tradeoff. Re-authenticates
// on every publish rather than caching the session token, since posting is
// infrequent and this avoids stale-session failures entirely.
interface BlueskySession {
  accessJwt: string;
  did: string;
}

async function createSession(handle: string, appPassword: string): Promise<BlueskySession> {
  const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Bluesky rejected that handle/app password" : `Bluesky returned HTTP ${res.status}`);
  return res.json() as Promise<BlueskySession>;
}

export const blueskyAdapter: SocialAdapter = {
  platform: "bluesky",
  async verify(credentials) {
    await createSession(credentials.handle!, credentials.appPassword!);
  },
  async publish(credentials, accountIdentifier, post) {
    const session = await createSession(credentials.handle!, credentials.appPassword!);
    const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: { $type: "app.bsky.feed.post", text: post.text, createdAt: new Date().toISOString() },
      }),
    });
    if (!res.ok) throw new Error(`Bluesky returned HTTP ${res.status}`);
    const data = (await res.json()) as { uri: string };
    const rkey = data.uri.split("/").pop();
    return { remoteId: data.uri, remoteUrl: `https://bsky.app/profile/${accountIdentifier}/post/${rkey}` };
  },
};
