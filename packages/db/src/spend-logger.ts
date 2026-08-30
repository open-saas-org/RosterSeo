import { db } from "./index";
import { providerSpendLog } from "./app-schema";

export type SpendLogInput = {
  provider: string;
  operation: string;
  model?: string | null;
  costUsd: number;
  isEstimate: boolean;
  promptTokens?: number | null;
  completionTokens?: number | null;
};

// Deliberately generic/untyped against packages/dataforseo's or
// packages/ai-visibility's own event shapes - packages/db can't import
// either of those without a circular dependency (both would need
// @rosterseo/db to log spend in the first place). Each app wires its own
// small adapter (see apps/web/instrumentation.ts, apps/worker/src/spend-logging.ts,
// apps/mcp-server/src/spend-logging.ts) that calls this with the right shape.
//
// Fire-and-forget by design: a failed spend-log write must never affect the
// real API call it's riding along with, and callers never need to await it.
export function insertSpendLog(input: SpendLogInput): void {
  void db
    .insert(providerSpendLog)
    .values({
      provider: input.provider,
      operation: input.operation,
      model: input.model ?? null,
      costUsd: input.costUsd,
      isEstimate: input.isEstimate,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
    })
    .catch((err) => console.error("[spend] failed to log provider spend:", err));
}
