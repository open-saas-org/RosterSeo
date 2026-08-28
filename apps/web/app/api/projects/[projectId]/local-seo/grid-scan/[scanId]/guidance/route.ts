import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { localBusinessProfiles, localGridScanPoints, localGridScans, withUserContext } from "@seo-tool/db";
import { generateLocalSeoGuidance } from "@seo-tool/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/local-seo/grid-scan/:scanId/guidance
// Real, on-demand LLM tip for a scan's weak grid coverage - not persisted,
// cheap to regenerate (same reasoning as AI Visibility Opportunities' tip
// route).

type RouteParams = { projectId: string; scanId: string };

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, scanId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const result = await withUserContext(session.user.id, async (tx) => {
    const [scan] = await tx.select().from(localGridScans).where(eq(localGridScans.id, scanId)).limit(1);
    if (!scan || scan.projectId !== projectId) return null;
    const points = await tx.select().from(localGridScanPoints).where(eq(localGridScanPoints.scanId, scanId));
    const [profile] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return { scan, points, profile };
  });

  if (!result) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const found = result.points.filter((p) => p.position !== null).map((p) => p.position!);
  const avgPosition = found.length > 0 ? found.reduce((a, b) => a + b, 0) / found.length : null;
  const pctInTop3 =
    result.points.length > 0
      ? (result.points.filter((p) => p.position !== null && p.position <= 3).length / result.points.length) * 100
      : 0;

  const businessName = result.profile?.name ?? project.name;
  const tip = await generateLocalSeoGuidance(result.scan.keyword, businessName, {
    avgPosition,
    pctInTop3,
    gridSize: result.scan.gridSize,
  });

  return NextResponse.json({ tip });
});
