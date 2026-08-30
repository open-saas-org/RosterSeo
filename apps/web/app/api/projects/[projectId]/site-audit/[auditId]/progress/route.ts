import { NextResponse } from "next/server";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { siteAudits, siteAuditPages, withUserContext } from "@rosterseo/db";
import { eq, desc } from "drizzle-orm";

export const GET = withAuth(async (req, { params }, session) => {
  const { projectId, auditId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await withUserContext(session.user.id, async (tx) => {
    const audit = await tx.query.siteAudits.findFirst({
      where: (t) => eq(t.id, auditId),
      columns: {
        id: true,
        status: true,
        pagesCrawled: true,
        pagesDiscovered: true,
        maxPages: true,
      },
    });

    if (!audit) return null;

    const recentPages = await tx.query.siteAuditPages.findMany({
      where: (t) => eq(t.auditId, auditId),
      orderBy: (t) => [desc(t.createdAt)],
      limit: 15,
      columns: {
        id: true,
        url: true,
        statusCode: true,
        title: true,
      },
    });

    return { audit, recentPages };
  });

  if (!result) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json(result);
});
