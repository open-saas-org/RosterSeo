import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET   /api/projects/:projectId/ai-visibility/targets - the project's
// configured AI Visibility targets (Settings > Providers), or [] if unset
// (POST .../run then falls back to every configured direct-API provider -
// see defaultTargets() in @seo-tool/ai-visibility).
// PATCH /api/projects/:projectId/ai-visibility/targets - replaces the full
// list. Real credentials stay global env vars; this is purely a per-project
// "which of the globally-configured providers/models to sample from" pick.

type RouteParams = { projectId: string };

type TargetInput = { model: string; provider: string; version?: string; webSearch: boolean; enabled: boolean };

function isValidTarget(t: unknown): t is TargetInput {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return typeof r.model === "string" && typeof r.provider === "string" && typeof r.webSearch === "boolean" && typeof r.enabled === "boolean";
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ targets: project.aiVisibilityTargets ?? [] });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.targets) || !body.targets.every(isValidTarget)) {
    return NextResponse.json({ error: "targets must be an array of { model, provider, webSearch, enabled }" }, { status: 400 });
  }

  const updated = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.update(projects).set({ aiVisibilityTargets: body.targets }).where(eq(projects.id, projectId)).returning();
    return row!;
  });

  return NextResponse.json({ targets: updated.aiVisibilityTargets ?? [] });
});
