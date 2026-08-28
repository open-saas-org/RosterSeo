import { insertSpendLog } from "@seo-tool/db";
import { setDataForSeoSpendLogger } from "@seo-tool/dataforseo";
import { setAiVisibilitySpendLogger } from "@seo-tool/ai-visibility";

// Same wiring as apps/web/lib/spend-logging.ts, for this process's own real
// dataforseo/ai-visibility calls (rank-check-runner, grid-scan-runner,
// weekly AI-visibility fan-out) - imported once at the top of index.ts.

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
