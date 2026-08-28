import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

// Lazy singleton, undefined until first call, null if not configured -
// server-side counterpart to components/posthog-provider.tsx. Same
// NEXT_PUBLIC_* key as the client: PostHog's own convention, the key
// itself isn't a secret (it only writes events, doesn't read data).
export function getPostHogServerClient(): PostHog | null {
  if (client !== undefined) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  client = key
    ? new PostHog(key, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        flushAt: 1,
        flushInterval: 0,
      })
    : null;
  return client;
}
