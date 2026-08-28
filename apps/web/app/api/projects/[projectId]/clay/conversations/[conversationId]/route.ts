import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { clayConversations, clayMessages, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; conversationId: string };

// GET    - the thread + all its messages (initial panel load / reload).
// DELETE - delete the thread (messages cascade).
// Every query below filters by userId too, not just projectId/id - a
// conversation belongs to the user who started it (see clay_conversations'
// own schema comment); this is application-layer, RLS doesn't know about
// per-user scoping.

async function loadOwnedConversation(userId: string, projectId: string, conversationId: string) {
  const [row] = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(clayConversations)
      .where(and(eq(clayConversations.id, conversationId), eq(clayConversations.projectId, projectId), eq(clayConversations.userId, userId)))
      .limit(1),
  );
  return row ?? null;
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, conversationId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = await loadOwnedConversation(session.user.id, projectId, conversationId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await withUserContext(session.user.id, (tx) =>
    tx.select().from(clayMessages).where(eq(clayMessages.conversationId, conversationId)).orderBy(asc(clayMessages.createdAt)),
  );

  return NextResponse.json({ conversation, messages });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, conversationId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx
      .delete(clayConversations)
      .where(and(eq(clayConversations.id, conversationId), eq(clayConversations.projectId, projectId), eq(clayConversations.userId, session.user.id)))
      .returning(),
  );
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
});
