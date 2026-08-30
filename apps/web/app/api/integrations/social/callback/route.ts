import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { socialConnections, withUserContext } from "@rosterseo/db";
import {
  decodeState,
  exchangeLinkedInCode,
  exchangeMastodonCode,
  exchangeMetaCode,
  exchangePinterestCode,
  exchangeThreadsCode,
  exchangeXCode,
  getSocialOAuthRedirectUri,
  isSocialOAuthConfigured,
  type ConnectableAccount,
  type SocialOAuthPlatform,
} from "@rosterseo/social";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";
import { getOrCreateMastodonApp } from "@/lib/social/mastodon-app";

type State = { projectId: string; platform: SocialOAuthPlatform; instanceUrl?: string };

// GET /api/integrations/social/callback?code=...&state=...
//
// Dispatches to the right platform's exchange function (see
// @rosterseo/social's oauth.ts), then upserts one social_connections row per
// real connectable account returned - zero further manual entry, matching
// Publish's blog OAuth callback. Matches on
// (projectId, platform, accountIdentifier) so reconnecting refreshes the
// token instead of creating duplicates.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");

  if (oauthError) return NextResponse.redirect(new URL(`/social/connections?error=${encodeURIComponent(oauthError)}`, req.url));
  if (!code || !rawState) return NextResponse.redirect(new URL("/social/connections?error=missing_code", req.url));

  let state: State;
  try {
    state = decodeState<State>(rawState);
  } catch {
    return NextResponse.redirect(new URL("/social/connections?error=invalid_state", req.url));
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.redirect(new URL("/social/connections?error=unauthorized", req.url));

  const project = await requireProjectAccess(state.projectId, session.user.id);
  if (!project) return NextResponse.redirect(new URL("/social/connections?error=project_not_found", req.url));

  if (state.platform !== "mastodon" && !isSocialOAuthConfigured(state.platform)) {
    return NextResponse.redirect(new URL("/social/connections?error=not_configured", req.url));
  }

  const redirectUri = getSocialOAuthRedirectUri();

  try {
    let accounts: ConnectableAccount[];

    switch (state.platform) {
      case "mastodon": {
        if (!state.instanceUrl) throw new Error("Missing instanceUrl in OAuth state");
        const { clientId, clientSecret } = await getOrCreateMastodonApp(state.instanceUrl, redirectUri);
        accounts = await exchangeMastodonCode(state.instanceUrl, clientId, clientSecret, code, redirectUri);
        break;
      }
      case "linkedin":
        accounts = await exchangeLinkedInCode(code, redirectUri);
        break;
      case "pinterest":
        accounts = await exchangePinterestCode(code, redirectUri);
        break;
      case "threads":
        accounts = await exchangeThreadsCode(code, redirectUri);
        break;
      case "facebook_page":
      case "instagram":
        accounts = await exchangeMetaCode(state.platform, code, redirectUri);
        break;
      case "x": {
        const codeVerifier = req.cookies.get("x_oauth_verifier")?.value;
        if (!codeVerifier) throw new Error("Missing PKCE verifier - the connect attempt may have expired, try again");
        accounts = await exchangeXCode(code, redirectUri, codeVerifier);
        break;
      }
      default:
        throw new Error(`Unknown platform: ${state.platform}`);
    }

    if (accounts.length === 0) {
      return NextResponse.redirect(new URL("/social/connections?error=no_accounts_found", req.url));
    }

    await withUserContext(session.user.id, async (tx) => {
      for (const account of accounts) {
        const [existing] = await tx
          .select({ id: socialConnections.id })
          .from(socialConnections)
          .where(and(eq(socialConnections.projectId, state.projectId), eq(socialConnections.platform, state.platform), eq(socialConnections.accountIdentifier, account.accountIdentifier)))
          .limit(1);

        if (existing) {
          await tx.update(socialConnections).set({ credentials: account.credentials, label: account.label, status: "connected", lastError: null, connectedAt: new Date() }).where(eq(socialConnections.id, existing.id));
        } else {
          await tx.insert(socialConnections).values({
            projectId: state.projectId,
            platform: state.platform,
            label: account.label,
            authType: "oauth",
            credentials: account.credentials,
            accountIdentifier: account.accountIdentifier,
          });
        }
      }
    });
  } catch (err) {
    console.error(`[social] ${state.platform} OAuth callback failed`, err);
    return NextResponse.redirect(new URL("/social/connections?error=token_exchange_failed", req.url));
  }

  const response = NextResponse.redirect(new URL(`/social/connections?connected=${state.platform}`, req.url));
  response.cookies.delete("x_oauth_verifier");
  return response;
}
