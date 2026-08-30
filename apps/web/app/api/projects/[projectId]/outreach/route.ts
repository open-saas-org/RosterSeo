import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { outreachTargets, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { addOutreachTarget } from "@/lib/outreach/add-outreach-target";

// GET  /api/projects/:projectId/outreach - list every outreach target for
//      the project, most recent first.
// POST /api/projects/:projectId/outreach - add a target, either from a real
//      backlink row (domain + sourceUrlFrom passed in) or a plain manual
//      domain. Real crawl-for-contact-email attempt happens here if no
//      contactEmail was supplied (see @rosterseo/crawler's findContactEmail) -
//      never fabricated, left null (and contactEmailSource null) if the
//      crawl finds nothing, so the UI can render an honest "no email found,
//      enter one" state instead of a fake address.

export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targets = await withUserContext(session.user.id, (tx) =>
    tx.select().from(outreachTargets).where(eq(outreachTargets.projectId, projectId)).orderBy(desc(outreachTargets.createdAt)),
  );

  return NextResponse.json({ targets });
});

export const POST = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  try {
    const target = await addOutreachTarget(session.user.id, projectId, {
      domain: typeof body?.domain === "string" ? body.domain : "",
      sourceUrlFrom: typeof body?.sourceUrlFrom === "string" ? body.sourceUrlFrom : undefined,
      contactEmail: typeof body?.contactEmail === "string" ? body.contactEmail : undefined,
    });
    return NextResponse.json({ target }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't add that target." }, { status: 400 });
  }
});
