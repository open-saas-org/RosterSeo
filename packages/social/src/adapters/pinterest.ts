import type { SocialAdapter } from "../types";

// Pinterest Pins API v5 - accountIdentifier is the target board_id. Pinterest
// fetches the image itself from a public URL (media_source: image_url) -
// no byte upload needed on our end.
interface PinterestPin {
  id: string;
}

export const pinterestAdapter: SocialAdapter = {
  platform: "pinterest",
  async verify(credentials) {
    const res = await fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (!res.ok) throw new Error(res.status === 401 ? "Pinterest rejected that access token" : `Pinterest returned HTTP ${res.status}`);
  },
  async publish(credentials, accountIdentifier, post) {
    if (post.mediaUrls.length === 0) throw new Error("Pinterest pins need at least one image");
    const res = await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: accountIdentifier, description: post.text, media_source: { source_type: "image_url", url: post.mediaUrls[0] } }),
    });
    if (!res.ok) throw new Error(`Pinterest returned HTTP ${res.status}`);
    const data = (await res.json()) as PinterestPin;
    return { remoteId: data.id, remoteUrl: `https://www.pinterest.com/pin/${data.id}/` };
  },
};
