import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { socialPosts, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { createSocialPost } from "@/lib/social/create-post";

type RouteParams = { projectId: string };

// See the blog equivalent route's identical comment re: optional ?status=.
export const GET = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = req.nextUrl.searchParams.get("status");
  const where = status ? and(eq(socialPosts.projectId, projectId), eq(socialPosts.status, status)) : eq(socialPosts.projectId, projectId);

  const posts = await withUserContext(session.user.id, (tx) => tx.select().from(socialPosts).where(where).orderBy(desc(socialPosts.createdAt)));

  return NextResponse.json({ posts });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  try {
    const { post, targets } = await createSocialPost(session.user.id, projectId, {
      text: typeof body?.text === "string" ? body.text : "",
      mediaUrls: Array.isArray(body?.mediaUrls) ? body.mediaUrls.filter((u: unknown) => typeof u === "string") : [],
      connectionIds: Array.isArray(body?.connectionIds) ? body.connectionIds.filter((id: unknown) => typeof id === "string") : [],
    });
    return NextResponse.json({ post, targets }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't create that post." }, { status: 400 });
  }
});
