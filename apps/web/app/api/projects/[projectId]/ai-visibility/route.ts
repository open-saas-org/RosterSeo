import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, withUserContext } from "@rosterseo/db";
import { calculateVisibilityScore } from "@rosterseo/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { trackAiVisibilityPrompt } from "@/lib/ai-visibility/track-prompt";

// GET  /api/projects/:projectId/ai-visibility - list tracked prompts for the
// project, each annotated with its most recent result per provider, plus an
// overall visibility % across the latest snapshot of every prompt/provider.
// POST /api/projects/:projectId/ai-visibility - add a new tracked prompt
// (e.g. "best [category] in [location]", "[brand] vs [competitor]" per PRD
// 5.7). No results exist for it until a run happens - see ./run/route.ts.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { prompts, visibilityPercent } = await withUserContext(session.user.id, async (tx) => {
    const trackedPrompts = await tx
      .select()
      .from(aiVisibilityPrompts)
      .where(eq(aiVisibilityPrompts.projectId, projectId))
      .orderBy(desc(aiVisibilityPrompts.createdAt));

    if (trackedPrompts.length === 0) {
      return { prompts: [], visibilityPercent: 0 };
    }

    // All results for these prompts, newest first - reduced in JS to the
    // latest row per (promptId, provider), same "one query, reduce to
    // latest snapshot" shape as the keywords route's ranking lookup.
    const results = await tx
      .select()
      .from(aiVisibilityResults)
      .where(
        inArray(
          aiVisibilityResults.promptId,
          trackedPrompts.map((p) => p.id),
        ),
      )
      .orderBy(desc(aiVisibilityResults.runAt));

    const latestByKey = new Map<string, (typeof results)[number]>();
    for (const result of results) {
      const key = `${result.promptId}::${result.provider}`;
      if (!latestByKey.has(key)) latestByKey.set(key, result);
    }

    const promptsWithResults = trackedPrompts.map((prompt) => ({
      ...prompt,
      latestResults: [...latestByKey.entries()]
        .filter(([key]) => key.startsWith(`${prompt.id}::`))
        .map(([, result]) => result),
    }));

    const visibilityPercent = calculateVisibilityScore(
      [...latestByKey.values()].map((r) => ({ mentioned: r.mentioned })),
    );

    return { prompts: promptsWithResults, visibilityPercent };
  });

  return NextResponse.json({ prompts, visibilityPercent });
});

export const POST = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const promptText = typeof body?.promptText === "string" ? body.promptText : "";

  try {
    const created = await trackAiVisibilityPrompt(session.user.id, projectId, promptText);
    return NextResponse.json({ prompt: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't track that prompt." }, { status: 400 });
  }
});
