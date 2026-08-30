import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl, isGoogleOAuthConfigured } from "@rosterseo/google";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

// GET /api/integrations/google/connect?projectId=...&service=gsc|ga4|gbp|merchant|gmail
//
// Entry point the "Connect" button on the Integrations page (and Backlink
// Outreach's "Connect Gmail" button) links to directly (a real browser
// navigation, not a fetch) - it redirects into Google's OAuth consent
// screen, which then redirects back to /api/integrations/google/callback.
// "gmail" is Outreach's send-as-you connection - same OAuth client/callback
// as every other service, distinguished only by scope + what the callback
// writes the tokens into (see that route's own comment).
//
// projectId/service arrive as a query string, not a path segment, so this
// doesn't fit withAuth's Params-typed wrapper (apps/web/lib/api-utils.ts) -
// the same session + project-access checks it performs are applied
// directly below instead.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const service = searchParams.get("service");

  if (!projectId || (service !== "gsc" && service !== "ga4" && service !== "gbp" && service !== "merchant" && service !== "gmail")) {
    return NextResponse.json({ error: "projectId and service ('gsc' | 'ga4' | 'gbp' | 'merchant' | 'gmail') query params are required" }, { status: 400 });
  }

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isGoogleOAuthConfigured()) {
    const errorPage = service === "gmail" ? "/outreach" : "/integrations";
    return NextResponse.redirect(new URL(`${errorPage}?error=not_configured`, req.url));
  }

  return NextResponse.redirect(getGoogleAuthUrl(projectId, service));
}
