import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { clayConversations, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { resumeClayTurn } from "@/lib/clay/agent-loop";
import { streamClayTurn } from "@/lib/clay/stream-response";

type RouteParams = { projectId: string; conversationId: string; toolCallId: string };

// POST { approve: boolean } - the real Approve/Deny action on a pending
// write-tool confirmation card. Nothing runs until this is called - see
// agent-loop.ts's resumeClayTurn for what actually executes on approve.
export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, conversationId, toolCallId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx
      .select({ id: clayConversations.id })
      .from(clayConversations)
      .where(and(eq(clayConversations.id, conversationId), eq(clayConversations.projectId, projectId), eq(clayConversations.userId, session.user.id)))
      .limit(1);
    return row ?? null;
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const approve = body?.approve === true;

  return streamClayTurn((emit) => resumeClayTurn(session.user.id, projectId, conversationId, toolCallId, approve, emit));
});
