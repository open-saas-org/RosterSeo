import type { TokenUsage } from "./types";
import { PROVIDER_COST_ESTIMATES_USD } from "./constants";

// Same DB-agnostic logger-hook pattern as packages/dataforseo/src/spend.ts -
// this package never imports @rosterseo/db directly; whichever app makes
// the real provider call (apps/web, apps/worker) wires setAiVisibilitySpendLogger
// once at startup to persist into provider_spend_log.

export type AiVisibilitySpendEvent = {
  provider: string;
  operation: "sample" | "structured_research" | "chat";
  model?: string;
  costUsd: number;
  isEstimate: boolean;
  usage?: TokenUsage;
};

type SpendLogger = (event: AiVisibilitySpendEvent) => void;

// globalThis-backed, not a plain module-level `let` - see
// packages/dataforseo/src/spend.ts's identical fix for why: a closure-local
// variable can end up duplicated across separate module instances under
// Next.js's bundler (instrumentation.ts's startup wiring and a real
// request's call into this package can resolve to two different copies of
// this module), which is exactly why provider_spend_log stayed empty
// despite real AI Visibility spend happening. globalThis is genuinely
// shared across every module instance in the same Node.js process.
const GLOBAL_KEY = Symbol.for("rosterseo.ai-visibility.spendLogger");

function getLogger(): SpendLogger | null {
  return (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] as SpendLogger | undefined ?? null;
}

export function setAiVisibilitySpendLogger(fn: SpendLogger): void {
  (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] = fn;
}

export function recordAiVisibilitySpend(event: AiVisibilitySpendEvent): void {
  const logger = getLogger();
  if (!logger) return;
  try {
    logger(event);
  } catch (err) {
    console.error("[ai-visibility] spend logger threw:", err);
  }
}

// Hand-maintained public per-1M-token USD pricing (input/output) for the
// specific models this project's direct-API providers hardcode - NOT pulled
// from a live pricing API, so treat as approximate and re-check against
// each provider's real pricing page if it matters precisely. Same honesty
// convention as PROVIDER_COST_ESTIMATES_USD above: an estimate computed
// from real token counts is still an estimate, never shown as a real bill.
// OpenRouter is deliberately absent - it fronts arbitrary third-party
// models with wildly different pricing, so its real returned `usage.cost`
// (see openrouter.ts) is used instead of a token-table guess whenever
// available.
const TOKEN_PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  sonar: { input: 1, output: 1 },
};

export function estimateCostFromUsage(model: string | undefined, usage: TokenUsage | undefined): number | null {
  if (!model || !usage) return null;
  const pricing = TOKEN_PRICING_PER_1M_USD[model];
  if (!pricing) return null;
  return (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
}

// Best real-or-estimated cost for one provider call, in priority order:
// 1. A real dollar cost the provider itself returned (OpenRouter).
// 2. A token-based estimate from a known model's pricing table.
// 3. The provider's flat per-run fallback estimate (BrightData, or any
//    model this table doesn't recognize yet).
export function resolveSpendUsd(
  provider: string,
  model: string | undefined,
  usage: TokenUsage | undefined,
  realCostUsd: number | undefined,
): { costUsd: number; isEstimate: boolean } {
  if (typeof realCostUsd === "number") return { costUsd: realCostUsd, isEstimate: false };
  const tokenEstimate = estimateCostFromUsage(model, usage);
  if (tokenEstimate !== null) return { costUsd: tokenEstimate, isEstimate: true };
  return { costUsd: PROVIDER_COST_ESTIMATES_USD[provider] ?? 0, isEstimate: true };
}
