import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@seo-tool/db";
import {
  calculateVisibilityScore,
  defaultTargets,
  runVisibilityCheckDetailed,
  toBrandOnlyRunResult,
  type AiVisibilityTarget,
} from "@seo-tool/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/ai-visibility/run - samples every tracked
// prompt for the project across its AI Visibility targets, `samplesPerProvider`
// times each (default 3, per PRD 5.7's "multiple samples per prompt for
// stability" - any 1-10, not just a preset), checking the brand AND every
// tracked competitor per sample (one real call each - competitor detection
// is parsed from the same response, not a separate call). Target resolution,
// in priority order: an explicit per-run `targets` override in the request
// body (the Visibility page's inline "AIs this run will sample" picker) ->
// the project's saved Settings -> Providers pick (projects.aiVisibilityTargets)
// -> defaultTargets() (BrightData's 5 scraped surfaces only) if neither is
// set. Persists
// one aiVisibilityResults row per (prompt, target, sample, entity), all
// sharing one runId so Share of Voice can query "the latest real run"
// precisely. Runs synchronously today for simplicity; per PRD Section 6 /
// architecture.mdx this is exactly the kind of multi-call action that
// belongs behind a background job (apps/worker) with status polling once
// that pipeline exists.

type RouteParams = { projectId: string };

type RunRequestBody = {
  samplesPerProvider?: unknown;
  targets?: unknown;
};

function parseTargetsOverride(input: unknown): AiVisibilityTarget[] | null {
  if (!Array.isArray(input)) return null;
  const parsed = input.filter(
    (t): t is AiVisibilityTarget =>
      !!t && typeof t === "object" && typeof (t as any).provider === "string" && typeof (t as any).model === "string",
  );
  return parsed.length > 0 ? parsed : null;
}

export const POST = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body: RunRequestBody = await req.json().catch(() => ({}));
  const samplesPerProvider =
    typeof body.samplesPerProvider === "number" && body.samplesPerProvider > 0 && body.samplesPerProvider <= 10
      ? Math.floor(body.samplesPerProvider)
      : 3;

  const targetsOverride = parseTargetsOverride(body.targets);
  const savedTargets = (project.aiVisibilityTargets ?? []).filter((t) => t.enabled !== false);
  const targets = targetsOverride ?? (savedTargets.length > 0 ? savedTargets : defaultTargets());

  const runId = crypto.randomUUID();

  const result = await withUserContext(session.user.id, async (tx) => {
    const [prompts, competitors] = await Promise.all([
      // A disabled prompt (Settings -> Prompts' per-row toggle) is skipped
      // here - still shown/editable on the Prompts page, just not sampled.
      tx.select().from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.projectId, projectId), eq(aiVisibilityPrompts.enabled, true))),
      tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, projectId)),
    ]);

    if (prompts.length === 0) {
      return { promptRuns: [], visibilityPercent: 0, samplesRun: 0 };
    }

    const competitorDomains = competitors.map((c) => c.domain);

    const detailedRuns = await runVisibilityCheckDetailed({
      prompts: prompts.map((p) => ({ id: p.id, promptText: p.promptText })),
      brandDomain: project.domain,
      competitorDomains,
      targets,
      samplesPerProvider,
      // Sub-brand/alt names and extra owned domains an LLM's answer might
      // use instead of the exact brand/competitor name - see client.ts's
      // parseResponseForEntity. Index-aligned with competitorDomains above.
      aliases: { brand: project.aiVisibilityAliases, competitors: competitors.map((c) => c.aliases) },
    });

    const rowsToInsert = detailedRuns.flatMap((run) =>
      run.samples.flatMap((sample) =>
        sample.entities.map((entity) => ({
          promptId: run.promptId,
          runId,
          entityDomain: entity.entityDomain,
          provider: sample.target.provider,
          model: sample.target.model,
          mentioned: entity.mentioned,
          position: entity.position,
          sentiment: entity.sentiment,
          responseSnippet: entity.responseSnippet,
          webQueries: sample.webQueries.length > 0 ? sample.webQueries : null,
          citations: sample.citations.length > 0 ? sample.citations : null,
          rawOutput: sample.rawOutput ?? null,
        })),
      ),
    );

    if (rowsToInsert.length > 0) {
      await tx.insert(aiVisibilityResults).values(rowsToInsert);
    }

    const promptRuns = detailedRuns.map(toBrandOnlyRunResult);
    const visibilityPercent = calculateVisibilityScore(
      promptRuns.flatMap((run) => run.samples.map((s) => ({ mentioned: s.result.mentioned }))),
    );

    return { promptRuns, visibilityPercent, samplesRun: rowsToInsert.length };
  });

  return NextResponse.json(result, { status: 201 });
});
