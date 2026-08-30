import { NextRequest, NextResponse } from "next/server";
import {
  encodeState,
  generatePkcePair,
  getLinkedInAuthorizeUrl,
  getMastodonAuthorizeUrl,
  getMetaAuthorizeUrl,
  getPinterestAuthorizeUrl,
  getSocialOAuthRedirectUri,
  getThreadsAuthorizeUrl,
  getXAuthorizeUrl,
  isSocialOAuthConfigured,
  type SocialOAuthPlatform,
} from "@rosterseo/social";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";
import { getOrCreateMastodonApp } from "@/lib/social/mastodon-app";

const PLATFORMS: SocialOAuthPlatform[] = ["mastodon", "linkedin", "pinterest", "facebook_page", "instagram", "threads", "x"];

// GET /api/integrations/social/connect?projectId=...&platform=...&instanceUrl=... (instanceUrl only for mastodon)
//
// Same shared-route, state-carries-context shape as
// /api/integrations/blog/connect, extended with X's PKCE (verifier stashed
// in a short-lived httpOnly cookie, read back at the callback) and
// Mastodon's per-instance dynamic app registration.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const platform = searchParams.get("platform") as SocialOAuthPlatform | null;
  const instanceUrl = searchParams.get("instanceUrl")?.trim();

  if (!projectId || !platform || !PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `projectId and platform (${PLATFORMS.join(" | ")}) query params are required` }, { status: 400 });
  }
  if (platform === "mastodon" && !instanceUrl) {
    return NextResponse.json({ error: "instanceUrl is required to connect Mastodon" }, { status: 400 });
  }

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (!isSocialOAuthConfigured(platform)) {
    return NextResponse.redirect(new URL("/social/connections?error=not_configured", req.url));
  }

  const redirectUri = getSocialOAuthRedirectUri();

  try {
    if (platform === "mastodon") {
      const normalized = instanceUrl!.replace(/\/+$/, "");
      const { clientId } = await getOrCreateMastodonApp(normalized, redirectUri);
      const state = encodeState({ projectId, platform, instanceUrl: normalized });
      return NextResponse.redirect(getMastodonAuthorizeUrl(normalized, clientId, redirectUri, state));
    }

    if (platform === "x") {
      const { codeVerifier, codeChallenge } = generatePkcePair();
      const state = encodeState({ projectId, platform });
      const response = NextResponse.redirect(getXAuthorizeUrl(redirectUri, state, codeChallenge));
      response.cookies.set("x_oauth_verifier", codeVerifier, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
      return response;
    }

    const state = encodeState({ projectId, platform });
    if (platform === "linkedin") return NextResponse.redirect(getLinkedInAuthorizeUrl(redirectUri, state));
    if (platform === "pinterest") return NextResponse.redirect(getPinterestAuthorizeUrl(redirectUri, state));
    if (platform === "threads") return NextResponse.redirect(getThreadsAuthorizeUrl(redirectUri, state));
    return NextResponse.redirect(getMetaAuthorizeUrl(platform, redirectUri, state));
  } catch (err) {
    console.error(`[social] ${platform} connect failed`, err);
    return NextResponse.redirect(new URL("/social/connections?error=connect_failed", req.url));
  }
}
