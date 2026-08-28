import type { SocialAdapter } from "../types";

// Threads API - accountIdentifier is the Threads user ID. Same two-step
// create-container-then-publish shape as Instagram (it's the same team's
// API design), but on graph.threads.net, not graph.facebook.com.
const THREADS_VERSION = "v1.0";

interface ThreadsContainer {
  id: string;
}

export const threadsAdapter: SocialAdapter = {
  platform: "threads",
  async verify(credentials, accountIdentifier) {
    const res = await fetch(`https://graph.threads.net/${THREADS_VERSION}/${accountIdentifier}?fields=id&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    if (!res.ok) throw new Error(`Threads returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    const createRes = await fetch(`https://graph.threads.net/${THREADS_VERSION}/${accountIdentifier}/threads`, {
      method: "POST",
      body: new URLSearchParams({ media_type: "TEXT", text: post.text, access_token: credentials.accessToken! }),
    });
    if (!createRes.ok) throw new Error(`Threads returned HTTP ${createRes.status}`);
    const container = (await createRes.json()) as ThreadsContainer;

    const publishRes = await fetch(`https://graph.threads.net/${THREADS_VERSION}/${accountIdentifier}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: credentials.accessToken! }),
    });
    if (!publishRes.ok) throw new Error(`Threads returned HTTP ${publishRes.status}`);
    const published = (await publishRes.json()) as ThreadsContainer;

    const permalinkRes = await fetch(`https://graph.threads.net/${THREADS_VERSION}/${published.id}?fields=permalink&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    const permalink = permalinkRes.ok ? ((await permalinkRes.json()) as { permalink?: string }).permalink : undefined;

    return { remoteId: published.id, remoteUrl: permalink ?? "https://www.threads.net/" };
  },
};
