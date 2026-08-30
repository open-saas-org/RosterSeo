import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { blogConnections, withUserContext } from "@rosterseo/db";
import { decodeBlogOAuthState, exchangeBlogOAuthCode, isBlogOAuthConfigured, listBlogOAuthSites } from "@rosterseo/publishing";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";

// GET /api/integrations/blog/callback?code=...&state=...
//
// The OAuth provider redirects the browser here after consent. Fetches
// the real list of sites/blogs the granted token can publish to and
// upserts one blogConnections row per site - zero further manual entry,
// no separate "which site?" picker screen (matches on
// (projectId, platform, siteIdentifier) so reconnecting just refreshes
// the token instead of creating duplicates).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/publish/connections?error=${encodeURIComponent(oauthError)}`, req.url));
  }
  if (!code || !rawState) {
    return NextResponse.redirect(new URL("/publish/connections?error=missing_code", req.url));
  }

  let state;
  try {
    state = decodeBlogOAuthState(rawState);
  } catch {
    return NextResponse.redirect(new URL("/publish/connections?error=invalid_state", req.url));
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.redirect(new URL("/publish/connections?error=unauthorized", req.url));

  const project = await requireProjectAccess(state.projectId, session.user.id);
  if (!project) return NextResponse.redirect(new URL("/publish/connections?error=project_not_found", req.url));

  if (!isBlogOAuthConfigured(state.platform)) {
    return NextResponse.redirect(new URL("/publish/connections?error=not_configured", req.url));
  }

  const codeVerifier = req.cookies.get("blog_oauth_pkce")?.value;

  try {
    const { accessToken } = await exchangeBlogOAuthCode(state.platform, code, codeVerifier, state.shopDomain);
    const sites = await listBlogOAuthSites(state.platform, accessToken, { shopDomain: state.shopDomain });

    await withUserContext(session.user.id, async (tx) => {
      for (const site of sites) {
        const [existing] = await tx
          .select({ id: blogConnections.id })
          .from(blogConnections)
          .where(and(eq(blogConnections.projectId, state.projectId), eq(blogConnections.platform, state.platform), eq(blogConnections.siteIdentifier, site.siteIdentifier)))
          .limit(1);

        const credentialsObj: Record<string, string> = state.platform === "shopify" ? { accessToken, shopDomain: state.shopDomain as string } : { accessToken };

        if (existing) {
          await tx.update(blogConnections).set({ credentials: credentialsObj, status: "connected", lastError: null, connectedAt: new Date() }).where(eq(blogConnections.id, existing.id));
        } else {
          await tx.insert(blogConnections).values({
            projectId: state.projectId,
            platform: state.platform,
            label: site.label,
            authType: "oauth",
            credentials: credentialsObj,
            siteIdentifier: site.siteIdentifier,
          });
        }
      }
    });
  } catch (err) {
    console.error(`[publish] ${state.platform} OAuth callback failed`, err);
    return NextResponse.redirect(new URL("/publish/connections?error=token_exchange_failed", req.url));
  }

  const response = NextResponse.redirect(new URL(`/publish/connections?connected=${state.platform}`, req.url));
  response.cookies.delete("blog_oauth_pkce");
  return response;
}
