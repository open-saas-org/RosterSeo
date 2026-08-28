import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { outreachTargets, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; outreachId: string };

// PATCH - real user edits: contactEmail, subject/body (the user editing the
// AI draft, or writing their own from scratch), or which connection to
// send from. Never touches status/sentAt/failureReason - those are only
// ever set by the draft/send routes and the worker.
export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, outreachId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const updates: Partial<typeof outreachTargets.$inferInsert> = {};
  if (typeof body?.contactEmail === "string") updates.contactEmail = body.contactEmail.trim() || null;
  if (typeof body?.subject === "string") updates.subject = body.subject;
  if (typeof body?.body === "string") updates.body = body.body;
  if (typeof body?.emailConnectionId === "string" || body?.emailConnectionId === null) updates.emailConnectionId = body.emailConnectionId;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // A target with a real subject+body counts as "drafted" even if the
  // draft was hand-written rather than AI-generated - status reflects
  // "ready to send," not "how it got written."
  if ((updates.subject !== undefined || updates.body !== undefined)) {
    const [current] = await withUserContext(session.user.id, (tx) =>
      tx.select().from(outreachTargets).where(and(eq(outreachTargets.id, outreachId), eq(outreachTargets.projectId, projectId))).limit(1),
    );
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const subject = updates.subject ?? current.subject;
    const bodyText = updates.body ?? current.body;
    if (subject && bodyText && current.status === "new") updates.status = "drafted";
  }

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx.update(outreachTargets).set(updates).where(and(eq(outreachTargets.id, outreachId), eq(outreachTargets.projectId, projectId))).returning(),
  );
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ target: updated });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, outreachId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx.delete(outreachTargets).where(and(eq(outreachTargets.id, outreachId), eq(outreachTargets.projectId, projectId))).returning(),
  );
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
});
