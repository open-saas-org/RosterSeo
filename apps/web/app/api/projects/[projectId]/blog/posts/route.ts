import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { blogPosts, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { createBlogPost } from "@/lib/publish/create-post";

type RouteParams = { projectId: string };

// GET  - list every post for the project, most recent first (the
//        /publish/posts list page - per-target status comes from the
//        [postId] detail route, not duplicated here).
// POST - create a draft post + one target per selected connection.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const posts = await withUserContext(session.user.id, (tx) => tx.select().from(blogPosts).where(eq(blogPosts.projectId, projectId)).orderBy(desc(blogPosts.createdAt)));

  return NextResponse.json({ posts });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  try {
    const { post, targets } = await createBlogPost(session.user.id, projectId, {
      title: typeof body?.title === "string" ? body.title : "",
      body: typeof body?.body === "string" ? body.body : "",
      excerpt: typeof body?.excerpt === "string" ? body.excerpt : undefined,
      coverImageUrl: typeof body?.coverImageUrl === "string" ? body.coverImageUrl : undefined,
      tags: Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [],
      connectionIds: Array.isArray(body?.connectionIds) ? body.connectionIds.filter((id: unknown) => typeof id === "string") : [],
    });
    return NextResponse.json({ post, targets }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't create that post." }, { status: 400 });
  }
});
