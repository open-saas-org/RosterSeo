import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { localGridScanPoints, localGridScans, withUserContext } from "@seo-tool/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET /api/projects/:projectId/local-seo/grid-scan/:scanId
// One real scan + all its points, for the map view.

type RouteParams = { projectId: string; scanId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, scanId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const result = await withUserContext(session.user.id, async (tx) => {
    const [scan] = await tx
      .select()
      .from(localGridScans)
      .where(eq(localGridScans.id, scanId))
      .limit(1);
    if (!scan || scan.projectId !== projectId) return null;

    const points = await tx.select().from(localGridScanPoints).where(eq(localGridScanPoints.scanId, scanId));
    return { scan, points };
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

  return NextResponse.json({ scan: result.scan, points: result.points, avgPosition, pctInTop3 });
});
