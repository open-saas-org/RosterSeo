import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { socialConnections, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { connectSocial } from "@/lib/social/connect-social";

type RouteParams = { projectId: string };

function toPublicConnection(row: typeof socialConnections.$inferSelect) {
  const { credentials: _credentials, ...rest } = row;
  return rest;
}

// GET    - list this project's connected social platforms (credentials redacted).
// POST   - connect one manually (Bluesky, or the fallback for OAuth-capable
//          platforms), live-verified before it's ever persisted.
// DELETE - disconnect (?id=).
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(socialConnections).where(eq(socialConnections.projectId, projectId)).orderBy(desc(socialConnections.connectedAt)),
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
  const accountIdentifier = typeof body?.accountIdentifier === "string" ? body.accountIdentifier.trim() : "";
  const credentials = typeof body?.credentials === "object" && body.credentials !== null ? body.credentials : {};
  if (!platform || !label || !accountIdentifier) {
    return NextResponse.json({ error: "platform, label, and accountIdentifier are required" }, { status: 400 });
  }

  try {
    const connection = await connectSocial(session.user.id, projectId, { platform, label, accountIdentifier, credentials });
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

  await withUserContext(session.user.id, (tx) => tx.delete(socialConnections).where(and(eq(socialConnections.id, id), eq(socialConnections.projectId, projectId))));

  return NextResponse.json({ ok: true });
});
