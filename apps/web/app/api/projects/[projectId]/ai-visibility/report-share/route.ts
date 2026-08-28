import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { aiVisibilityReportShares, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// Manages the real, revocable public share link for this project's AI
// Visibility report (/reports/ai-visibility/[projectId]) - see
// ai_visibility_report_shares' own schema comment for why this table is
// deliberately not RLS-protected. Every route here still requires a real
// signed-in session with real access to this project (withAuth +
// requireProjectAccess) - only the report page ITSELF accepts a bare token
// with no session, since that's the whole point of a share link.

type RouteParams = { projectId: string };

function shareUrl(req: NextRequest, projectId: string, token: string): string {
  return `${new URL(req.url).origin}/reports/ai-visibility/${projectId}?token=${token}`;
}

export const GET = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [existing] = await withUserContext(session.user.id, (tx) =>
    tx.select().from(aiVisibilityReportShares).where(eq(aiVisibilityReportShares.projectId, projectId)).limit(1),
  );

  return NextResponse.json({ shareUrl: existing ? shareUrl(req, projectId, existing.token) : null });
});

// Generates a fresh link, replacing (revoking) any previous one - a share
// link is one-at-a-time per project, same "regenerate invalidates the old
// one" convention as the MCP API key flow.
export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

  await withUserContext(session.user.id, (tx) =>
    tx
      .insert(aiVisibilityReportShares)
      .values({ projectId, createdByUserId: session.user.id, token })
      .onConflictDoUpdate({
        target: aiVisibilityReportShares.projectId,
        set: { token, createdByUserId: session.user.id, createdAt: new Date() },
      }),
  );

  return NextResponse.json({ shareUrl: shareUrl(req, projectId, token) });
});

export const DELETE = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await withUserContext(session.user.id, (tx) => tx.delete(aiVisibilityReportShares).where(eq(aiVisibilityReportShares.projectId, projectId)));

  return NextResponse.json({ ok: true });
});
