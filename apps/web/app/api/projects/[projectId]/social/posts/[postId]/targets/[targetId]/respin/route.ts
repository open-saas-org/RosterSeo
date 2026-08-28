import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { socialPostTargets, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { respinSocialPostTarget } from "@/lib/social/respin-target";

type RouteParams = { projectId: string; postId: string; targetId: string };

// POST  - (re)generates the AI-adapted, char-limit-aware text for one
//         target platform. PATCH - saves a manual edit without calling AI.
export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId, targetId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const target = await respinSocialPostTarget(session.user.id, projectId, postId, targetId, project.domain);
    return NextResponse.json({ target });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't generate a respin.";
    const status = message.endsWith("not found.") ? 404 : message.startsWith("Configure OpenRouter") ? 422 : 502;
    return NextResponse.json({ error: message }, { status });
  }
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, targetId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const adaptedBody = typeof body?.adaptedBody === "string" ? body.adaptedBody : undefined;
  if (adaptedBody === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const [target] = await withUserContext(session.user.id, (tx) =>
    tx.update(socialPostTargets).set({ adaptedBody }).where(and(eq(socialPostTargets.id, targetId), eq(socialPostTargets.projectId, projectId))).returning(),
  );
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ target });
});
