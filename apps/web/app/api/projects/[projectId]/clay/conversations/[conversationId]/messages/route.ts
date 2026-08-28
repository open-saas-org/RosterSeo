import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { clayConversations, clayMessages, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { runClayTurn } from "@/lib/clay/agent-loop";
import { streamClayTurn } from "@/lib/clay/stream-response";

type RouteParams = { projectId: string; conversationId: string };

// POST { content: string } - the real send action. Verifies the
// conversation belongs to (projectId, this user), inserts the user's
// message, sets a title from it if this is the thread's first message,
// then runs a real turn (runClayTurn) and returns whatever new messages
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
      .from(clayConversations)
      .where(and(eq(clayConversations.id, conversationId), eq(clayConversations.projectId, projectId), eq(clayConversations.userId, session.user.id)))
      .limit(1);
    return row ?? null;
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await withUserContext(session.user.id, async (tx) => {
    await tx.insert(clayMessages).values({ conversationId, projectId, role: "user", content });
    if (!conversation.title) {
      await tx.update(clayConversations).set({ title: content.slice(0, 60), lastMessageAt: new Date() }).where(eq(clayConversations.id, conversationId));
    } else {
      await tx.update(clayConversations).set({ lastMessageAt: new Date() }).where(eq(clayConversations.id, conversationId));
    }
  });

  return streamClayTurn((emit) => runClayTurn(session.user.id, projectId, conversationId, emit));
});
