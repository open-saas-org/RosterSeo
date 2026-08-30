import { NextResponse } from "next/server";
import { analyzeBrand } from "@rosterseo/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/ai-visibility/onboarding-research - one
// real, web-search-enabled LLM call that researches a brand-new project and
// suggests competitors + a starter tracked-prompt set for the user to
// review before saving (apps/web/app/onboarding/page.tsx). Real-only, no
// mock fallback: returns `{ research: null }` when no structured-research-
// capable provider (OpenRouter, OpenAI, Anthropic) is configured or the
// call fails, so the onboarding flow can skip this step silently rather
// than show a fabricated suggestion set.

type RouteParams = { projectId: string };

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const research = await analyzeBrand(project.name, project.domain);
  return NextResponse.json({ research });
});
