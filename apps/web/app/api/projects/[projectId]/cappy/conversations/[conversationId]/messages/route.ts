import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { cappyConversations, cappyMessages, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { runCappyTurn } from "@/lib/cappy/agent-loop";
import { streamCappyTurn } from "@/lib/cappy/stream-response";

type RouteParams = { projectId: string; conversationId: string };

// POST { content: string } - the real send action. Verifies the
// conversation belongs to (projectId, this user), inserts the user's
// message, sets a title from it if this is the thread's first message,
// then runs a real turn (runCappyTurn) and returns whatever new messages
// resulted - which may end with a real answer or a pending tool-call
// confirmation.
export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, conversationId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

  const conversation = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(cappyConversations)
      .where(and(eq(cappyConversations.id, conversationId), eq(cappyConversations.projectId, projectId), eq(cappyConversations.userId, session.user.id)))
      .limit(1);
    return row ?? null;
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await withUserContext(session.user.id, async (tx) => {
    await tx.insert(cappyMessages).values({ conversationId, projectId, role: "user", content });
    if (!conversation.title) {
      await tx.update(cappyConversations).set({ title: content.slice(0, 60), lastMessageAt: new Date() }).where(eq(cappyConversations.id, conversationId));
    } else {
      await tx.update(cappyConversations).set({ lastMessageAt: new Date() }).where(eq(cappyConversations.id, conversationId));
    }
  });

  return streamCappyTurn((emit) => runCappyTurn(session.user.id, projectId, conversationId, emit));
});
