import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { wordpressConnections, withUserContext } from "@rosterseo/db";
import { verifyWordPressConnection, listRecentPosts } from "@rosterseo/wordpress";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET    /api/projects/:projectId/wordpress - connection status + real
//        recent posts if connected (proof-of-connection, not a full CMS
//        view - this is connect-only for now, see the integrations plan).
// POST   body: { siteUrl, username, applicationPassword } - real WP REST
//        API verification via a live posts call, saved only on success.
// DELETE - disconnect (drops the row entirely, no soft-disconnect state
//        needed since there's nothing else referencing this connection).

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const conn = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(wordpressConnections).where(eq(wordpressConnections.projectId, projectId)).limit(1);
    return row ?? null;
  });

  if (!conn) {
    return NextResponse.json({ connected: false });
  }

  try {
    const posts = await listRecentPosts(conn.siteUrl, conn.username, conn.applicationPassword, 5);
    return NextResponse.json({ connected: true, siteUrl: conn.siteUrl, connectedAt: conn.connectedAt, posts });
  } catch (err) {
    console.error("WordPress recent-posts fetch failed", err);
    return NextResponse.json({ connected: true, siteUrl: conn.siteUrl, connectedAt: conn.connectedAt, posts: [], fetchFailed: true });
  }
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const siteUrl = typeof body?.siteUrl === "string" ? body.siteUrl.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const applicationPassword = typeof body?.applicationPassword === "string" ? body.applicationPassword.trim() : "";
  if (!siteUrl || !username || !applicationPassword) {
    return NextResponse.json({ error: "siteUrl, username, and applicationPassword are required" }, { status: 400 });
  }

  try {
    await verifyWordPressConnection(siteUrl, username, applicationPassword);
  } catch (err) {
    console.error("WordPress connection verification failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't connect to that WordPress site" }, { status: 400 });
  }

  await withUserContext(session.user.id, (tx) =>
    tx
      .insert(wordpressConnections)
      .values({ projectId, siteUrl, username, applicationPassword })
      .onConflictDoUpdate({
        target: wordpressConnections.projectId,
        set: { siteUrl, username, applicationPassword, connectedAt: new Date() },
      }),
  );

  return NextResponse.json({ connected: true });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await withUserContext(session.user.id, (tx) => tx.delete(wordpressConnections).where(eq(wordpressConnections.projectId, projectId)));

  return NextResponse.json({ ok: true });
});
