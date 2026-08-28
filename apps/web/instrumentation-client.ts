import * as Sentry from "@sentry/nextjs";

// Client-side DSN has to be NEXT_PUBLIC_* (server-only SENTRY_DSN isn't
// available in the browser bundle) - inert if unset, same as the server side.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
