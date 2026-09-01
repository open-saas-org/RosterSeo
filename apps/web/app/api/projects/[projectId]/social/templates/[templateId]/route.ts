import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { socialPlatformTemplates, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

type RouteParams = { projectId: string; templateId: string };

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, templateId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .delete(socialPlatformTemplates)
      .where(and(eq(socialPlatformTemplates.id, templateId), eq(socialPlatformTemplates.projectId, projectId)))
      .returning();
    return row;
  });

  if (!deleted) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ template: deleted });
});
