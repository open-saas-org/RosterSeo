import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { aiVisibilityPrompts, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// DELETE /api/projects/:projectId/ai-visibility/:promptId - stop tracking a
// prompt. Its historical results (aiVisibilityResults) cascade-delete via
// the FK's onDelete: "cascade" (see packages/db/src/app-schema.ts).
// PATCH  /api/projects/:projectId/ai-visibility/:promptId - update a
// prompt's real tags and/or enabled state ({ tags?: string[], enabled?:
// boolean }). A disabled prompt is skipped by POST .../run but keeps its
// history - distinct from deleting it.

type RouteParams = { projectId: string; promptId: string };

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, promptId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const deleted = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .delete(aiVisibilityPrompts)
      .where(and(eq(aiVisibilityPrompts.id, promptId), eq(aiVisibilityPrompts.projectId, projectId)))
      .returning();
    return row;
  });

  if (!deleted) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  return NextResponse.json({ prompt: deleted });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, promptId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const updates: { tags?: string[]; enabled?: boolean } = {};
  if (Array.isArray(body?.tags) && body.tags.every((t: unknown) => typeof t === "string")) {
    updates.tags = body.tags.map((t: string) => t.trim()).filter(Boolean);
  }
  if (typeof body?.enabled === "boolean") {
    updates.enabled = body.enabled;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update - pass tags and/or enabled" }, { status: 400 });
  }

  const updated = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .update(aiVisibilityPrompts)
      .set(updates)
      .where(and(eq(aiVisibilityPrompts.id, promptId), eq(aiVisibilityPrompts.projectId, projectId)))
      .returning();
    return row;
  });

  if (!updated) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  return NextResponse.json({ prompt: updated });
});
