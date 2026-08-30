import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { cappyConversations, cappyMessages, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string; conversationId: string };

// GET    - the thread + all its messages (initial panel load / reload).
// DELETE - delete the thread (messages cascade).
// Every query below filters by userId too, not just projectId/id - a
// conversation belongs to the user who started it (see cappy_conversations'
// own schema comment); this is application-layer, RLS doesn't know about
// per-user scoping.

async function loadOwnedConversation(userId: string, projectId: string, conversationId: string) {
  const [row] = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(cappyConversations)
      .where(and(eq(cappyConversations.id, conversationId), eq(cappyConversations.projectId, projectId), eq(cappyConversations.userId, userId)))
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
    tx.select().from(cappyMessages).where(eq(cappyMessages.conversationId, conversationId)).orderBy(asc(cappyMessages.createdAt)),
  );

  return NextResponse.json({ conversation, messages });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, conversationId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx
      .delete(cappyConversations)
      .where(and(eq(cappyConversations.id, conversationId), eq(cappyConversations.projectId, projectId), eq(cappyConversations.userId, session.user.id)))
      .returning(),
  );
  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
});
