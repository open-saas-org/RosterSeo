import { insertSpendLog } from "@seo-tool/db";
import { setDataForSeoSpendLogger } from "@seo-tool/dataforseo";
import { setAiVisibilitySpendLogger } from "@seo-tool/ai-visibility";

// Wires packages/dataforseo's and packages/ai-visibility's DB-agnostic
// spend-logger hooks to real persistence, once, at server startup (called
// from instrumentation.ts's register()). Both packages stay free of a
// @seo-tool/db dependency - see packages/db/src/spend-logger.ts's own
// comment for why - this is the one place apps/web actually connects them.
let wired = false;

export function wireProviderSpendLogging(): void {
  if (wired) return;
  wired = true;

  setDataForSeoSpendLogger((event) => {
    insertSpendLog({ provider: "dataforseo", operation: event.operation, costUsd: event.costUsd, isEstimate: false });
  });

  setAiVisibilitySpendLogger((event) => {
    insertSpendLog({
      provider: event.provider,
      operation: event.operation,
      model: event.model,
      costUsd: event.costUsd,
      isEstimate: event.isEstimate,
      promptTokens: event.usage?.promptTokens,
      completionTokens: event.usage?.completionTokens,
    });
  });
}
