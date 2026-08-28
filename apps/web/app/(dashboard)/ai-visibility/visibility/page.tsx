import { eq, inArray } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AiVisibilityRunControls } from "@/components/ai-visibility/ai-visibility-run-controls";
import { VisibilityDashboard } from "@/components/ai-visibility/visibility-dashboard";
import { calculateVisibilityScore, defaultTargets, getAllProviders, getModelDisplayLabel } from "@seo-tool/ai-visibility";
import { getCurrentProject } from "@/lib/current-project";

// Capped at 6 total entities (brand + up to 5 tracked competitors) to match
// the validated categorical chart palette's 6 slots (dataviz skill).
const MAX_COMPETITOR_ENTITIES = 5;

export default async function AiVisibilityPage() {
  const { session, project } = await getCurrentProject();
  const allProvidersRegistry = getAllProviders();
  const configured = allProvidersRegistry.some((p) => p.isConfigured());
  const providerStatus = Object.fromEntries(allProvidersRegistry.map((p) => [p.id, p.isConfigured()])) as Record<string, boolean>;

  const rawTargets = project.aiVisibilityTargets && project.aiVisibilityTargets.length > 0
    ? project.aiVisibilityTargets.filter((t) => t.enabled !== false)
    : defaultTargets();
  const activeTargets = rawTargets
    .filter((t) => providerStatus[t.provider])
    .map((t) => ({ provider: t.provider, model: t.model }));

  const { dashboardPrompts, entities, allTags, allProviders, totalCompetitors, summary } = await withUserContext(session.user.id, async (tx) => {
    const [prompts, competitors] = await Promise.all([
      tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id)),
      tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, project.id)),
    ]);

    const entities = [
      { key: "brand", label: project.name },
      ...competitors.slice(0, MAX_COMPETITOR_ENTITIES).map((c) => ({ key: c.domain, label: c.name || c.domain })),
    ];
    const entityKeys = new Set(entities.map((e) => e.key));
    const promptIds = prompts.map((p) => p.id);

    // Real, unbounded history (no fixed time window) - the dashboard's
    // day/model filters slice this client-side, so switching them never
    // needs a new server round-trip.
    const results = promptIds.length === 0 ? [] : await tx.select().from(aiVisibilityResults).where(inArray(aiVisibilityResults.promptId, promptIds));

    const statsByPrompt = new Map<string, Array<{ date: string; provider: string; model: string; entityKey: string; mentioned: number; total: number }>>();
    const byDayBrandOverall = new Map<string, { mentioned: boolean }[]>();
    // Keyed by the real (provider, model) pair, not provider alone -
    // BrightData fronts 5 distinct AI surfaces (chatgpt/gemini/perplexity/
    // copilot/google-ai-overview) that all share provider="brightdata", so
    // grouping by provider alone collapsed all five into one filter option
    // and made the model picker unable to isolate "ChatGPT only" etc.
    // Matches the same real (provider, model) pattern the Citations and
    // Query Fan-Out pages already use.
    const providersSeen = new Map<string, { provider: string; model: string }>();
    const runIds = new Set<string>();
    let totalCitations = 0;

    for (const r of results) {
      runIds.add(r.runId);
      totalCitations += r.citations?.length ?? 0;
      const entityKey = r.entityDomain === null ? "brand" : r.entityDomain;
      if (!entityKeys.has(entityKey)) continue; // stale/untracked competitor, not in the current entity set

      const model = r.model ?? r.provider;
      providersSeen.set(model, { provider: r.provider, model });
      const date = r.runAt.toISOString().slice(0, 10);
      const list = statsByPrompt.get(r.promptId) ?? [];
      list.push({ date, provider: r.provider, model, entityKey, mentioned: r.mentioned ? 1 : 0, total: 1 });
      statsByPrompt.set(r.promptId, list);

      if (entityKey === "brand") {
        const dayList = byDayBrandOverall.get(date) ?? [];
        dayList.push({ mentioned: r.mentioned });
        byDayBrandOverall.set(date, dayList);
      }
    }

    const overallSparkline = [...byDayBrandOverall.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, samples]) => ({ date, visibilityPercent: calculateVisibilityScore(samples) }));

    const dashboardPrompts = prompts.map((p) => ({
      id: p.id,
      promptText: p.promptText,
      tags: p.tags ?? [],
      enabled: p.enabled,
      stats: statsByPrompt.get(p.id) ?? [],
    }));

    const allTags = [...new Set(prompts.flatMap((p) => p.tags ?? []))].sort();
    const allProviders = [...providersSeen.values()].map(({ provider, model }) => ({ id: model, label: getModelDisplayLabel(provider, model) }));

    return {
      dashboardPrompts,
      entities,
      allTags,
      allProviders,
      totalCompetitors: competitors.length,
      summary: {
        totalPromptsTracked: prompts.filter((p) => p.enabled).length,
        totalRuns: runIds.size,
        totalCitations,
        overallSparkline,
        currentVisibilityPercent: overallSparkline.at(-1)?.visibilityPercent ?? 0,
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Visibility"
        actions={
          <div className="flex items-center gap-4 flex-wrap justify-end">
            <AiVisibilityRunControls
              projectId={project.id}
              configured={configured}
              providerStatus={providerStatus}
              activeTargets={activeTargets}
              hasPrompts={dashboardPrompts.length > 0}
            />
          </div>
        }
      />
      
      {!configured ? (
        <Alert>
          <AlertTitle>No LLM provider keys configured</AlertTitle>
          <AlertDescription>
            Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, PERPLEXITY_API_KEY, BRIGHTDATA_API_TOKEN, or
            OPENROUTER_API_KEY to enable sampling — real API calls only, a run against no configured provider
            persists nothing.
          </AlertDescription>
        </Alert>
      ) : null}

      {!dashboardPrompts.length ? (
        <p className="text-sm text-muted-foreground">
          No prompts tracked yet - add some on the{" "}
          <a href="/ai-visibility/settings/prompts" className="underline">
            Prompts
          </a>{" "}
          page first.
        </p>
      ) : null}
      {totalCompetitors > MAX_COMPETITOR_ENTITIES ? (
        <p className="text-xs text-muted-foreground">
          Showing your brand plus the first {MAX_COMPETITOR_ENTITIES} of {totalCompetitors} tracked competitors (by
          when they were added) - only {MAX_COMPETITOR_ENTITIES} competitor slots fit the chart palette. Manage the
          list on{" "}
          <a href="/competitors" className="underline hover:text-foreground">
            Competitors
          </a>
          .
        </p>
      ) : null}
      <VisibilityDashboard
        prompts={dashboardPrompts}
        entities={entities}
        allTags={allTags}
        allProviders={allProviders}
        summary={summary}
      />
    </div>
  );
}
