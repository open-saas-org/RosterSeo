import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { emailConnections, withUserContext } from "@rosterseo/db";
import { verifySmtpConnection } from "@rosterseo/email";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

// Connected outreach senders for a project - SMTP connections are created
// here directly; Gmail OAuth connections are created by the
// /api/integrations/gmail/connect -> /callback round trip instead (a real
// browser navigation, not a fetch this route could handle). GET never
// returns smtp_password_encrypted/gmail_access_token/gmail_refresh_token -
// the UI only ever needs to know a connection exists and its display info.

function toPublicConnection(row: typeof emailConnections.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    dailySendLimit: row.dailySendLimit,
    gmailNeedsReconnect: row.gmailNeedsReconnect,
    createdAt: row.createdAt,
  };
}

export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await withUserContext(session.user.id, (tx) =>
    tx.select().from(emailConnections).where(eq(emailConnections.projectId, projectId)).orderBy(desc(emailConnections.createdAt)),
  );

  return NextResponse.json({ connections: rows.map(toPublicConnection) });
});

export const POST = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const host = typeof body?.smtpHost === "string" ? body.smtpHost.trim() : "";
  const port = Number(body?.smtpPort);
  const username = typeof body?.smtpUsername === "string" ? body.smtpUsername.trim() : "";
  const password = typeof body?.smtpPassword === "string" ? body.smtpPassword : "";
  const fromEmail = typeof body?.fromEmail === "string" ? body.fromEmail.trim() : "";
  const fromName = typeof body?.fromName === "string" && body.fromName.trim() ? body.fromName.trim() : null;
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : fromEmail;

  if (!host || !Number.isFinite(port) || !username || !password || !fromEmail) {
    return NextResponse.json({ error: "smtpHost, smtpPort, smtpUsername, smtpPassword, and fromEmail are all required." }, { status: 400 });
  }

  try {
    await verifySmtpConnection({ host, port, username, password });
  } catch (err) {
    return NextResponse.json({ error: `Couldn't connect: ${err instanceof Error ? err.message : "check your SMTP details and try again."}` }, { status: 400 });
  }

  const [connection] = await withUserContext(session.user.id, (tx) =>
    tx
      .insert(emailConnections)
      .values({ projectId, type: "smtp", label, fromEmail, fromName, smtpHost: host, smtpPort: port, smtpUsername: username, smtpPasswordEncrypted: password })
      .returning(),
  );

  return NextResponse.json({ connection: toPublicConnection(connection!) }, { status: 201 });
});

export const DELETE = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing required query param: id" }, { status: 400 });

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx.delete(emailConnections).where(and(eq(emailConnections.id, id), eq(emailConnections.projectId, projectId))).returning(),
  );
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
});
