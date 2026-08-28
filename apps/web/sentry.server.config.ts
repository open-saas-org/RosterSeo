import * as Sentry from "@sentry/nextjs";

// Only called from instrumentation.ts's register(), which itself is
// gated on SENTRY_DSN being set - see that file for why.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
