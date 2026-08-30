import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { blogPostTargets, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { respinBlogPostTarget } from "@/lib/publish/respin-target";

type RouteParams = { projectId: string; postId: string; targetId: string };

// POST  - (re)generates the AI-adapted title/body for one target platform.
//         Overwrites any existing adaptedTitle/adaptedBody - only ever hit
//         from a real "Respin" / "Regenerate" button, same
//         intentional-overwrite reasoning as Outreach's draft route.
// PATCH - saves a manual edit to adaptedTitle/adaptedBody (the review
//         page's textareas) without calling AI - hit right before
//         publish so in-flight edits aren't lost.
export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, postId, targetId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const target = await respinBlogPostTarget(session.user.id, projectId, postId, targetId, project.domain);
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
  const adaptedTitle = typeof body?.adaptedTitle === "string" ? body.adaptedTitle : undefined;
  const adaptedBody = typeof body?.adaptedBody === "string" ? body.adaptedBody : undefined;
  if (adaptedTitle === undefined && adaptedBody === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const [target] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(blogPostTargets)
      .set({ ...(adaptedTitle !== undefined ? { adaptedTitle } : {}), ...(adaptedBody !== undefined ? { adaptedBody } : {}) })
      .where(and(eq(blogPostTargets.id, targetId), eq(blogPostTargets.projectId, projectId)))
      .returning(),
  );
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ target });
});
