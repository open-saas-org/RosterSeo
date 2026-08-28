import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

type RouteParams = { projectId: string };

// GET /api/projects/:projectId - full project details for Project Settings
// (the switcher only carries id/name/domain; this fills in the rest).
export const GET = withAuth<RouteParams>(async (_req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
});

// PATCH /api/projects/:projectId - body: { archivedAt: string | null }.
// The only supported update here is archive ("delete but keep the data" -
// set to now) / restore (set back to null). Every real row this project
// owns (rank tracking, page analyzer reports, site audits, AI visibility
// data, etc.) stays untouched either way - see app-schema.ts's comment on
// `projects.archivedAt`.
export const PATCH = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !("archivedAt" in body) || (body.archivedAt !== null && typeof body.archivedAt !== "string")) {
    return NextResponse.json({ error: "'archivedAt' must be null or an ISO date string" }, { status: 400 });
  }

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(projects)
      .set({ archivedAt: body.archivedAt ? new Date(body.archivedAt) : null })
      .where(eq(projects.id, projectId))
      .returning(),
  );

  return NextResponse.json({ project: updated });
});

// DELETE /api/projects/:projectId - real, permanent, cascading delete.
// Every projectId-referencing table in app-schema.ts declares
// { onDelete: "cascade" }, so this one statement removes the project and
// everything under it (rank tracking, reports, audits, AI visibility data,
// local SEO data, etc.) at the database level - irreversible, unlike the
// archive path above. Requires the real domain as a body confirmation
// (`confirmDomain`) so a bare DELETE call can't destroy data by accident;
// the actual "are you sure" UX lives client-side in the confirm dialog.
export const DELETE = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.confirmDomain !== "string" || body.confirmDomain !== project.domain) {
    return NextResponse.json({ error: "confirmDomain must exactly match the project's domain." }, { status: 400 });
  }

  await withUserContext(session.user.id, (tx) => tx.delete(projects).where(eq(projects.id, projectId)));

  return NextResponse.json({ success: true });
});
