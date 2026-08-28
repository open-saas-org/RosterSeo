import { NextResponse } from "next/server";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { generateDraftForOutreachTarget } from "@/lib/outreach/generate-outreach-draft";

type RouteParams = { projectId: string; outreachId: string };

// POST - (re)generates the AI draft for one target via OpenRouter (see
// @seo-tool/ai-visibility's generateOutreachEmail for the OpenRouter-only,
// "not_configured" vs "failed" distinction this follows). Overwrites any
// existing subject/body - callers only hit this from a real "Generate" /
// "Regenerate" button, never automatically, so an intentional overwrite is
// exactly what's being asked for.
export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, outreachId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const target = await generateDraftForOutreachTarget(session.user.id, projectId, outreachId, project);
    return NextResponse.json({ target });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't generate a draft.";
    const status = message === "Outreach target not found." ? 404 : message.startsWith("Configure OpenRouter") ? 422 : 502;
    return NextResponse.json({ error: message }, { status });
  }
});
