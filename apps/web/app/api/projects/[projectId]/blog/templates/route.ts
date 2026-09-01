import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { blogPlatformTemplates, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const templates = await withUserContext(session.user.id, (tx) =>
    tx.select().from(blogPlatformTemplates).where(eq(blogPlatformTemplates.projectId, projectId)).orderBy(desc(blogPlatformTemplates.createdAt)),
  );

  return NextResponse.json({ templates });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const connectionIds = Array.isArray(body?.connectionIds) ? body.connectionIds.filter((id: unknown) => typeof id === "string") : [];

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (connectionIds.length === 0) return NextResponse.json({ error: "Select at least one platform to save." }, { status: 400 });

  const [template] = await withUserContext(session.user.id, (tx) =>
    tx.insert(blogPlatformTemplates).values({ projectId, name, connectionIds }).returning(),
  );

  return NextResponse.json({ template }, { status: 201 });
});
