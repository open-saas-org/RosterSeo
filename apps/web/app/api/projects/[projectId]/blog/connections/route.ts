import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { blogConnections, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { connectBlog } from "@/lib/publish/connect-blog";

type RouteParams = { projectId: string };

function toPublicConnection(row: typeof blogConnections.$inferSelect) {
  // credentials never leaves the server, same redaction chokepoint as
  // email_connections' GET route.
  const { credentials: _credentials, ...rest } = row;
  return rest;
}

// GET    - list this project's connected blog platforms (credentials redacted).
// POST   - connect one, live-verified before it's ever persisted (see
//          lib/publish/connect-blog.ts).
// DELETE - disconnect (?id=), drops the row entirely.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(blogConnections).where(eq(blogConnections.projectId, projectId)).orderBy(desc(blogConnections.connectedAt)),
  );

  return NextResponse.json({ connections: connections.map(toPublicConnection) });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const platform = typeof body?.platform === "string" ? body.platform : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const siteIdentifier = typeof body?.siteIdentifier === "string" ? body.siteIdentifier.trim() : "";
  const credentials = typeof body?.credentials === "object" && body.credentials !== null ? body.credentials : {};
  if (!platform || !label || !siteIdentifier) {
    return NextResponse.json({ error: "platform, label, and siteIdentifier are required" }, { status: 400 });
  }

  try {
    const connection = await connectBlog(session.user.id, projectId, { platform, label, siteIdentifier, credentials });
    return NextResponse.json({ connection: toPublicConnection(connection!) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't connect that platform." }, { status: 400 });
  }
});

export const DELETE = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await withUserContext(session.user.id, (tx) => tx.delete(blogConnections).where(and(eq(blogConnections.id, id), eq(blogConnections.projectId, projectId))));

  return NextResponse.json({ ok: true });
});
