import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { clayConversations, withUserContext } from "@seo-tool/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

// GET  - this user's Clay threads for the project, most recent first.
//        Scoped to (projectId, userId) at the application-query layer -
//        RLS only enforces the org boundary here, same as every other
//        table (see clay_conversations' own schema comment for why).
// POST - start a new, empty thread.
export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversations = await withUserContext(session.user.id, (tx) =>
    tx
      .select()
      .from(clayConversations)
      .where(and(eq(clayConversations.projectId, projectId), eq(clayConversations.userId, session.user.id)))
      .orderBy(desc(clayConversations.lastMessageAt)),
  );

  return NextResponse.json({ conversations });
});

export const POST = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [conversation] = await withUserContext(session.user.id, (tx) =>
    tx.insert(clayConversations).values({ projectId, userId: session.user.id }).returning(),
  );

  return NextResponse.json({ conversation }, { status: 201 });
});
