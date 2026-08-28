import { and, eq, inArray, isNull } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, withUserContext } from "@seo-tool/db";
import { getModelDisplayLabel } from "@seo-tool/ai-visibility";
import { PageHeader } from "@/components/page-header";
import { QueryFanOutDashboard } from "@/components/ai-visibility/query-fan-out-dashboard";
import { getCurrentProject } from "@/lib/current-project";

export default async function QueryFanOutPage() {
  const { session, project } = await getCurrentProject();

  const { rows, prompts, allTags, allModels } = await withUserContext(session.user.id, async (tx) => {
    const promptRows = await tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id));
    const promptIds = promptRows.map((p) => p.id);
    const promptTextById = new Map(promptRows.map((p) => [p.id, p.promptText]));

    // entityDomain IS NULL: one row per real run (the brand row) - competitor
    // rows for the same run share the exact same webQueries, so including
    // them would multiply-count every real query.
    const results =
      promptIds.length === 0
        ? []
        : await tx
            .select()
            .from(aiVisibilityResults)
            .where(and(inArray(aiVisibilityResults.promptId, promptIds), isNull(aiVisibilityResults.entityDomain)));

    const rows = results
      .filter((r) => Array.isArray(r.webQueries) && r.webQueries.length > 0)
      .map((r) => ({
        promptId: r.promptId,
        promptText: promptTextById.get(r.promptId) ?? "",
        provider: r.provider,
        model: r.model ?? r.provider,
        date: r.runAt.toISOString().slice(0, 10),
        webQueries: r.webQueries as string[],
        mentioned: r.mentioned,
      }));

    const modelMap = new Map<string, string>();
    for (const r of rows) modelMap.set(r.model, getModelDisplayLabel(r.provider, r.model));

    return {
      rows,
      prompts: promptRows.map((p) => ({ id: p.id, tags: p.tags ?? [] })),
      allTags: [...new Set(promptRows.flatMap((p) => p.tags ?? []))].sort(),
      allModels: [...modelMap.entries()].map(([value, label]) => ({ value, label })),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Query Fan-Out" description="The web searches AI engines run when answering your prompts." />
      <QueryFanOutDashboard rows={rows} prompts={prompts} allTags={allTags} allModels={allModels} />
    </div>
  );
}
