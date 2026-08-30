import { verifyWordPressConnection, createPost } from "@rosterseo/wordpress";
import type { BlogAdapter } from "../types";

// Thin wrapper around packages/wordpress's real client - no logic
// duplicated here, just adapted to the common BlogAdapter shape.
export const wordpressAdapter: BlogAdapter = {
  platform: "wordpress",
  async verify(credentials, siteIdentifier) {
    await verifyWordPressConnection(siteIdentifier, credentials.username!, credentials.appPassword!);
  },
  async publish(credentials, siteIdentifier, post) {
    const result = await createPost(siteIdentifier, credentials.username!, credentials.appPassword!, { title: post.title, content: post.html, status: "publish" });
    return { remoteId: result.id, remoteUrl: result.url };
  },
};
