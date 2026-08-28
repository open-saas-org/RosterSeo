import type { SocialAdapter } from "../types";

// Instagram Content Publishing API (Business Login) - accountIdentifier is
// the Instagram Business Account ID. Two-step publish (create a media
// container, then publish it) same as Meta's own docs; Instagram fetches
// the image itself from image_url - no byte upload needed on our end. An
// extra GET for `permalink` gets the real public URL (the id returned by
// media_publish is not itself a usable link).
const GRAPH_VERSION = "v25.0";

interface MediaContainer {
  id: string;
}

export const instagramAdapter: SocialAdapter = {
  platform: "instagram",
  async verify(credentials, accountIdentifier) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}?fields=id,username&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    if (!res.ok) throw new Error(`Instagram returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    if (post.mediaUrls.length === 0) throw new Error("Instagram posts need at least one image");

    const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: post.mediaUrls[0]!, caption: post.text, access_token: credentials.accessToken! }),
    });
    if (!createRes.ok) throw new Error(`Instagram returned HTTP ${createRes.status}`);
    const container = (await createRes.json()) as MediaContainer;

    const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountIdentifier}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: credentials.accessToken! }),
    });
    if (!publishRes.ok) throw new Error(`Instagram returned HTTP ${publishRes.status}`);
    const published = (await publishRes.json()) as MediaContainer;

    const permalinkRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${published.id}?fields=permalink&access_token=${encodeURIComponent(credentials.accessToken!)}`);
    const permalink = permalinkRes.ok ? ((await permalinkRes.json()) as { permalink?: string }).permalink : undefined;

    return { remoteId: published.id, remoteUrl: permalink ?? `https://www.instagram.com/` };
  },
};
