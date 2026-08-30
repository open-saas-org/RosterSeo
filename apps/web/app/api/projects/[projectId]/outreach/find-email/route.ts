import { NextResponse } from "next/server";
import { findContactEmail } from "@rosterseo/crawler";
import { normalizeDomain, isValidDomain } from "@/components/competitors/domain-utils";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

// POST - real crawl-for-contact-email, standalone (not tied to creating a
// target) - used by a "Find email" retry button for a target whose initial
// add-time crawl found nothing. Returns null (not an error) when the crawl
// genuinely finds nothing, so the UI can show an honest "still nothing
// found" state.
export const POST = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const domain = normalizeDomain(typeof body?.domain === "string" ? body.domain : "");
  if (!isValidDomain(domain)) return NextResponse.json({ error: "Enter a valid domain, e.g. example.com" }, { status: 400 });

  try {
    const found = await findContactEmail(domain);
    return NextResponse.json({ found });
  } catch (err) {
    console.error(`[outreach] find-email crawl failed for ${domain}`, err);
    return NextResponse.json({ found: null });
  }
});
