import * as Sentry from "@sentry/node";

// Must be imported first, before any other module, per Sentry's Node SDK
// requirements for auto-instrumentation to attach correctly. Inert if
// SENTRY_DSN isn't set - same isConfigured()-style gate used everywhere else.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
