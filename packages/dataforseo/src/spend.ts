// Real per-call cost tracking for the Spend page (apps/web's /spend route).
// This package stays DB-agnostic on purpose (see packages/db's README on
// why only apps, never packages, depend on @rosterseo/db) - instead of
// importing a database client directly, it exposes a settable logger hook
// that whichever app actually makes real calls (apps/web, apps/worker,
// apps/mcp-server) wires up once at startup to persist into
// provider_spend_log. Callers that never call setSpendLogger (tests, a
// script that only needs mock data) get a silent no-op, same as this
// package's existing behavior with no DATAFORSEO_LOGIN/PASSWORD set.

export type DataForSeoSpendEvent = {
  operation: string;
  costUsd: number;
};

type SpendLogger = (event: DataForSeoSpendEvent) => void;

// A plain module-level `let` here can silently end up duplicated across
// separate module instances under Next.js's bundler - confirmed live: the
// app's own instrumentation.ts calls setDataForSeoSpendLogger() at startup,
// but a real request's call into recordDataForSeoSpend() resolved to a
// DIFFERENT copy of this module where the logger was still unset, so real
// DataForSEO calls happened (confirmed via their own returned `cost`) while
// provider_spend_log stayed completely empty. globalThis is the one thing
// genuinely shared across every module instance in the same Node.js
// process, so the logger reference lives there instead of a closure-local
// variable that a second module instance can't see.
const GLOBAL_KEY = Symbol.for("rosterseo.dataforseo.spendLogger");

function getLogger(): SpendLogger | null {
  return (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] as SpendLogger | undefined ?? null;
}

export function setDataForSeoSpendLogger(fn: SpendLogger): void {
  (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] = fn;
}

export function recordDataForSeoSpend(event: DataForSeoSpendEvent): void {
  const logger = getLogger();
  if (!logger) return;
  try {
    logger(event);
  } catch (err) {
    // A broken spend logger must never take down the real API call it's
    // riding along with - log and move on.
    console.error("[dataforseo] spend logger threw:", err);
  }
}
