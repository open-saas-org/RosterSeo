import * as Sentry from "@sentry/nextjs";

// Covers the edge runtime - middleware.ts runs here. Only called from
// instrumentation.ts's register(), gated on SENTRY_DSN.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
