import { eq, inArray } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@seo-tool/db";
import { getModelDisplayLabel } from "@seo-tool/ai-visibility";
import { PageHeader } from "@/components/page-header";
import { ShareOfVoiceDashboard } from "@/components/ai-visibility/share-of-voice-dashboard";
import { getCurrentProject } from "@/lib/current-project";

export default async function ShareOfVoicePage() {
  const { session, project } = await getCurrentProject();

  const { rows, entities, prompts, allTags, allProviders } = await withUserContext(session.user.id, async (tx) => {
    const [promptRows, competitors] = await Promise.all([
      tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id)),
      tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, project.id)),
    ]);

    const entities = [
      { key: "brand", label: project.name, isBrand: true },
      ...competitors.map((c) => ({ key: c.domain, label: c.name || c.domain, isBrand: false })),
    ];
    const entityKeys = new Set(entities.map((e) => e.key));
    const promptIds = promptRows.map((p) => p.id);

    const results = promptIds.length === 0 ? [] : await tx.select().from(aiVisibilityResults).where(inArray(aiVisibilityResults.promptId, promptIds));

    // Keyed by the real (provider, model) pair, not provider alone - see
    // the same fix on the Visibility page for why (BrightData fronts 5
    // distinct AI surfaces that all share provider="brightdata").
    const providersSeen = new Map<string, { provider: string; model: string }>();
    const rows = results
      .map((r) => {
        const entityKey = r.entityDomain === null ? "brand" : r.entityDomain;
        if (!entityKeys.has(entityKey)) return null; // stale/untracked competitor
        const model = r.model ?? r.provider;
        providersSeen.set(model, { provider: r.provider, model });
        return {
          date: r.runAt.toISOString().slice(0, 10),
          provider: r.provider,
          model,
          promptId: r.promptId,
          runId: r.runId,
          entityKey,
          mentioned: r.mentioned,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      rows,
      entities,
      prompts: promptRows.map((p) => ({ id: p.id, tags: p.tags ?? [] })),
      allTags: [...new Set(promptRows.flatMap((p) => p.tags ?? []))].sort(),
      allProviders: [...providersSeen.values()].map(({ provider, model }) => ({ id: model, label: getModelDisplayLabel(provider, model) })),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Share of Voice" description="How often AI engines mention you versus your competitors." />
      <ShareOfVoiceDashboard rows={rows} entities={entities} prompts={prompts} allTags={allTags} allProviders={allProviders} brandName={project.name} />
    </div>
  );
}
