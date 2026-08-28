import { NextResponse } from "next/server";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { startSiteAudit } from "@/lib/site-audit/start-site-audit";

import { withUserContext } from "@seo-tool/db";
import { eq, desc } from "drizzle-orm";

export const POST = withAuth(async (req, { params }, session) => {
  const { projectId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {}

  const auditId = await startSiteAudit(session.user.id, project, {
    domain: body.domain,
    customSitemapUrl: body.customSitemapUrl,
    maxPages: Number(body.maxPages),
  });

  return NextResponse.json({ auditId });
});

export const GET = withAuth(async (req, { params }, session) => {
  const { projectId } = await params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const audits = await withUserContext(session.user.id, (tx) =>
    tx.query.siteAudits.findMany({
      where: (t) => eq(t.projectId, projectId),
      orderBy: (t) => [desc(t.startedAt)],
    })
  );

  return NextResponse.json(audits);
});
