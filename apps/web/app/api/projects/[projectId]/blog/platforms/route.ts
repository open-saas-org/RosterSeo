import { NextResponse } from "next/server";
import { BLOG_PLATFORMS } from "@seo-tool/publishing";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

// GET - the static platform registry (which platforms exist, what a
// connect form needs, which are gated) - fetched by the client instead of
// importing @seo-tool/publishing directly, since that package also pulls
// in server-only adapter code (node:crypto for Ghost's JWT signing) that
// has no business in a browser bundle.
export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ platforms: BLOG_PLATFORMS });
});
