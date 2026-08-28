import * as Sentry from "@sentry/nextjs";

// Sentry stays fully inert - no network calls, no overhead - until
// SENTRY_DSN is set, matching the isConfigured() pattern used by
// packages/dataforseo, packages/ai-visibility, and packages/google.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { wireProviderSpendLogging } = await import("./lib/spend-logging");
    wireProviderSpendLogging();
  }

  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
