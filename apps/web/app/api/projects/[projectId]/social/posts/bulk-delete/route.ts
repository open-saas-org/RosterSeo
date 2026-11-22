import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { socialPosts, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string };

// See the blog equivalent route's identical comment.
export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx.delete(socialPosts).where(and(eq(socialPosts.projectId, projectId), inArray(socialPosts.id, ids))).returning({ id: socialPosts.id }),
  );

  return NextResponse.json({ deleted: deleted.length });
});
