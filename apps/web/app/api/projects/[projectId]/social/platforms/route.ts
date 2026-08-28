import { NextResponse } from "next/server";
import { SOCIAL_PLATFORMS } from "@seo-tool/social";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

// GET - the static platform registry, same reasoning as .../blog/platforms:
// fetched by the client instead of importing @seo-tool/social directly,
// which also pulls in server-only OAuth code.
export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ platforms: SOCIAL_PLATFORMS });
});
