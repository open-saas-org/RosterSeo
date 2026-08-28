import { google } from "googleapis";
import type { GoogleService, GoogleTokens } from "./types";

// GSC + GA4 + GBP all authenticate through a single Google Cloud OAuth
// client - the scope requested at consent time is what separates them, not
// a different client. See PRD Section 5.6: webmasters.readonly and
// analytics.readonly are "sensitive" (not "restricted") scopes, so
// verification is Google's free review process, not a paid CASA audit.
// business.manage is also just a sensitive scope for the OAuth CONSENT
// itself - the separate manual approval process gating the actual Business
// Profile REST APIs (see business-profile.ts) is unrelated to this and
// isn't a scope-verification thing at all.
// Space-separated when a service needs more than one real scope (gmail:
// send-only + the email address needed to label the connection) - see
// getGoogleAuthUrl's `.split(" ")` below.
const SCOPES: Record<GoogleService, string> = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gbp: "https://www.googleapis.com/auth/business.manage",
  merchant: "https://www.googleapis.com/auth/content",
  // gmail.send is the narrowest real scope for Backlink Outreach - lets the
  // app send mail as the connected account but never read/list/delete
  // anything in their inbox. userinfo.email is added so the callback can
  // look up the real connected address without asking the user to type it
  // in again.
  gmail: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
};

// Mirrors packages/dataforseo/src/client.ts's isDataForSeoConfigured() -
// same idea, applied to Google OAuth. Callers (routes, UI) should check
// this before attempting a connect/exchange call and show a clear "not
// configured" state instead of a confusing failure.
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

// No dedicated GOOGLE_OAUTH_REDIRECT_URI env var exists yet in .env /
// .env.example (out of this package's file-ownership boundary to add) - it
// takes precedence if set, otherwise it's derived from BETTER_AUTH_URL,
// which is already the canonical "where is this app running" var used by
// better-auth itself (apps/web/lib/auth.ts).
function getRedirectUri(): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/integrations/google/callback`;
}

function createOAuthClient() {
  if (!isGoogleOAuthConfigured()) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    getRedirectUri(),
  );
}

// state carries projectId + service through the round trip so the callback
// route (apps/web/app/api/integrations/google/callback/route.ts) knows
// which project and which service (gsc | ga4 | gbp) it's completing a
// connection for, without relying on session/cookie state that may not
// survive the redirect to Google and back.
export interface GoogleOAuthState {
  projectId: string;
  service: GoogleService;
}

export function encodeState(state: GoogleOAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

const VALID_SERVICES: GoogleService[] = ["gsc", "ga4", "gbp", "merchant", "gmail"];

export function decodeState(raw: string): GoogleOAuthState {
  const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || typeof parsed.projectId !== "string" || !VALID_SERVICES.includes(parsed.service)) {
    throw new Error("Invalid OAuth state payload");
  }
  return { projectId: parsed.projectId, service: parsed.service };
}

// Builds the real Google OAuth consent URL. access_type: "offline" +
// prompt: "consent" are both required to reliably get a refresh_token back
// - without them Google only returns one on the very first ever consent for
// that user+client, which is useless for a "reconnect after revoke" flow.
export function getGoogleAuthUrl(projectId: string, service: GoogleService): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES[service].split(" "),
    state: encodeState({ projectId, service }),
  });
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    // A missing refresh_token almost always means the user had already
    // granted consent before and Google silently omitted it this time -
    // see the prompt: "consent" comment above for why we force it anyway.
    throw new Error(
      "Google did not return both an access token and a refresh token. " +
        "The user may need to revoke prior access at https://myaccount.google.com/permissions and reconnect.",
    );
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
  };
}

// Thrown only when Google's refresh actually confirms the grant is dead
// (invalid_grant - the refresh token was revoked, e.g. the user removed
// access at myaccount.google.com/permissions, or it expired from ~6
// months of disuse). Callers should treat this, and only this, as "the
// user must redo OAuth consent" - a plain network/API error refreshing a
// token that's still good should NOT force a reconnect.
export class GoogleReauthRequiredError extends Error {
  constructor(message = "Google access was revoked; the user must reconnect.") {
    super(message);
    this.name = "GoogleReauthRequiredError";
  }
}

// Access tokens last ~1 hour; refresh tokens don't expire under normal use
// (Google only invalidates one on explicit revocation or ~6 months of
// disuse). Every real GSC/GA4 data call should go through a caller that
// uses this instead of a stored accessToken directly once it's stale -
// see apps/web/lib/google-token.ts, which is what actually persists the
// refreshed pair back to google_connections.
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new GoogleReauthRequiredError("Google did not return a new access token when refreshing.");
    }
    return {
      accessToken: credentials.access_token,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3600 * 1000),
    };
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) throw err;
    // googleapis throws a GaxiosError whose response body carries Google's
    // OAuth error code directly.
    const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    if (code === "invalid_grant") {
      throw new GoogleReauthRequiredError();
    }
    throw err;
  }
}
