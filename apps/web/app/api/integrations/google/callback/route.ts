import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { emailConnections, googleConnections, withUserContext } from "@seo-tool/db";
import { decodeState, exchangeCodeForTokens, getGmailAddress, isGoogleOAuthConfigured } from "@seo-tool/google";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

// GET /api/integrations/google/callback?code=...&state=...
//
// Google redirects the browser here after consent. `state` (built by
// getGoogleAuthUrl in @seo-tool/google) carries the projectId + service the
// connect request was for, since nothing else survives the round trip to
// Google and back. Every failure path redirects back to whichever page
// initiated the connect (Integrations for gsc/ga4/gbp/merchant, Outreach
// for gmail) with ?error=... - this is a top-level browser navigation, not
// a fetch a client component can read a JSON body from.
//
// "gmail" is Backlink Outreach's send-as-you connection - it deliberately
// reuses this exact same OAuth client/callback/redirect-uri (the one
// actually registered with Google) rather than a second callback route,
// but writes into the project-scoped email_connections table instead of
// the organization-scoped google_connections one every other service uses
// - see email_connections' own schema comment for why outreach identity
// can't be org-scoped the way a verified GSC property can.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");

  if (oauthError) {
    // e.g. "access_denied" when the user declines consent. Not yet decoded,
    // so we don't know which page to send them back to - Integrations is
    // the more common case.
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(oauthError)}`, req.url));
  }
  if (!code || !rawState) {
    return NextResponse.redirect(new URL("/integrations?error=missing_code", req.url));
  }

  let state;
  try {
    state = decodeState(rawState);
  } catch {
    return NextResponse.redirect(new URL("/integrations?error=invalid_state", req.url));
  }

  const returnTo = state.service === "gmail" ? "/outreach" : "/integrations";

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.redirect(new URL(`${returnTo}?error=unauthorized`, req.url));
  }

  const project = await requireProjectAccess(state.projectId, session.user.id);
  if (!project) {
    return NextResponse.redirect(new URL(`${returnTo}?error=project_not_found`, req.url));
  }

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL(`${returnTo}?error=not_configured`, req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (state.service === "gmail") {
      const address = await getGmailAddress(tokens.accessToken);
      await withUserContext(session.user.id, async (tx) => {
        const [existing] = await tx
          .select()
          .from(emailConnections)
          .where(and(eq(emailConnections.projectId, state.projectId), eq(emailConnections.type, "gmail_oauth"), eq(emailConnections.fromEmail, address)))
          .limit(1);

        if (existing) {
          await tx
            .update(emailConnections)
            .set({ gmailAccessToken: tokens.accessToken, gmailRefreshToken: tokens.refreshToken, gmailExpiresAt: tokens.expiresAt, gmailNeedsReconnect: false })
            .where(eq(emailConnections.id, existing.id));
        } else {
          await tx.insert(emailConnections).values({
            projectId: state.projectId,
            type: "gmail_oauth",
            label: address,
            fromEmail: address,
            gmailAccessToken: tokens.accessToken,
            gmailRefreshToken: tokens.refreshToken,
            gmailExpiresAt: tokens.expiresAt,
          });
        }
      });
    } else {
      // One connection per (organization, service) - the OAuth grant belongs
      // to the Google account, shared by every project under this org. The
      // access check above still runs against the specific project the user
      // clicked "Connect" from (requireProjectAccess), but storage keys off
      // project.organizationId, not project.id. Which property THIS project
      // uses is a separate, per-project choice (projects.gscPropertyId /
      // ga4PropertyId), picked later via PropertyPicker - not set here.
      const service = state.service;
      await withUserContext(session.user.id, async (tx) => {
        const [existing] = await tx
          .select()
          .from(googleConnections)
          .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, service)))
          .limit(1);

        if (existing) {
          await tx
            .update(googleConnections)
            .set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              needsReconnect: false,
              connectedAt: new Date(),
            })
            .where(eq(googleConnections.id, existing.id));
        } else {
          await tx.insert(googleConnections).values({
            organizationId: project.organizationId,
            service,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
          });
        }
      });
    }
  } catch (err) {
    console.error("Google OAuth token exchange failed", err);
    return NextResponse.redirect(new URL(`${returnTo}?error=token_exchange_failed`, req.url));
  }

  return NextResponse.redirect(new URL(`${returnTo}?connected=${state.service}`, req.url));
}
