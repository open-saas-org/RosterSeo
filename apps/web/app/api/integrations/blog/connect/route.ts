import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBlogOAuthUrl, isBlogOAuthConfigured, type BlogOAuthPlatform } from "@rosterseo/publishing";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

// GET /api/integrations/blog/connect?projectId=...&platform=wordpress_com|tumblr
//
// The Publish Connections page's "Connect via OAuth" button links here
// directly (a real browser navigation) - redirects into that platform's
// own OAuth consent screen, which redirects back to
// /api/integrations/blog/callback. Same shared-route,
// state-carries-context shape as /api/integrations/google/connect.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const platform = searchParams.get("platform");
  const shopDomain = searchParams.get("shopDomain") || undefined;

  if (!projectId || (platform !== "wordpress_com" && platform !== "tumblr" && platform !== "hubspot" && platform !== "webflow" && platform !== "shopify")) {
    return NextResponse.json({ error: "projectId and platform ('wordpress_com' | 'tumblr' | 'hubspot' | 'webflow' | 'shopify') query params are required" }, { status: 400 });
  }
  const blogPlatform = platform as BlogOAuthPlatform;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (!isBlogOAuthConfigured(blogPlatform)) {
    return NextResponse.redirect(new URL("/publish/connections?error=not_configured", req.url));
  }

  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;

  if (blogPlatform === "hubspot") {
    codeVerifier = crypto.randomBytes(32).toString("base64url");
    codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  let oauthUrl: string;
  try {
    oauthUrl = getBlogOAuthUrl(blogPlatform, projectId, codeChallenge, shopDomain);
  } catch (err) {
    return NextResponse.redirect(new URL(`/publish/connections?error=${encodeURIComponent(err instanceof Error ? err.message : "OAuth error")}`, req.url));
  }

  const response = NextResponse.redirect(oauthUrl);
  
  if (codeVerifier) {
    response.cookies.set("blog_oauth_pkce", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 3600, // 1 hour
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
