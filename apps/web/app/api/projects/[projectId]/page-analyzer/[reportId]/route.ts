import { NextResponse } from "next/server";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { withUserContext } from "@seo-tool/db";
import { eq } from "drizzle-orm";

// GET /api/projects/:projectId/page-analyzer/:reportId
// Backs the real, shareable /page-analyzer?reportId=X report view.
export const GET = withAuth(async (req, { params }, session) => {
  const { projectId, reportId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await withUserContext(session.user.id, (tx) =>
    tx.query.pageAnalyzerReports.findFirst({
      where: (t) => eq(t.id, reportId),
    }),
  );

  if (!report || report.projectId !== projectId) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ report });
});
