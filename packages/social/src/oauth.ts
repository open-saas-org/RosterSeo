import { createHash, randomBytes } from "node:crypto";

// Real one-click OAuth for every social platform except Bluesky (App
// Password, see that adapter's own comment). Each platform has a
// genuinely different shape - a shared generic function doesn't fit here
// the way it did for Publish's two OAuth blogs, so this file is organized
// per-platform instead. All URLs below were verified against each
// platform's own current developer docs, not assumed from memory.

export type SocialOAuthPlatform = "mastodon" | "linkedin" | "pinterest" | "facebook_page" | "instagram" | "threads" | "x";

export interface ConnectableAccount {
  accountIdentifier: string;
  label: string;
  credentials: Record<string, string>;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function encodeState(payload: Record<string, string>): string {
  return base64url(Buffer.from(JSON.stringify(payload)));
}

export function decodeState<T>(raw: string): T {
  return JSON.parse(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as T;
}

// ---------------------------------------------------------------------------
// Mastodon - per-instance dynamic app registration (POST {instance}/api/v1/apps),
// no operator-level client id/secret needed at all. apps/web/lib/social owns
// caching the result in the mastodon_apps table; this file only makes the
// real HTTP calls.
// ---------------------------------------------------------------------------

export async function registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string }> {
  const res = await fetch(`${instanceUrl.replace(/\/+$/, "")}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "SEO Tool Publish", redirect_uris: redirectUri, scopes: "read write", website: redirectUri }),
  });
  if (!res.ok) throw new Error(`Couldn't register with that Mastodon instance (HTTP ${res.status})`);
  const data = (await res.json()) as { client_id: string; client_secret: string };
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

export function getMastodonAuthorizeUrl(instanceUrl: string, clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "read write", state });
  return `${instanceUrl.replace(/\/+$/, "")}/oauth/authorize?${params.toString()}`;
}

export async function exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<ConnectableAccount[]> {
  const tokenRes = await fetch(`${instanceUrl.replace(/\/+$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri, scope: "read write" }),
  });
  if (!tokenRes.ok) throw new Error(`Mastodon rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch(`${instanceUrl.replace(/\/+$/, "")}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) throw new Error(`Couldn't read the connected Mastodon account (HTTP ${meRes.status})`);
  const me = (await meRes.json()) as { username: string };

  return [{ accountIdentifier: instanceUrl, label: `@${me.username}@${new URL(instanceUrl).host}`, credentials: { accessToken: access_token } }];
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

function isLinkedInConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function getLinkedInAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) throw new Error("LinkedIn OAuth isn't configured on this deployment");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state, scope: "openid profile w_member_social" });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeLinkedInCode(code: string, redirectUri: string): Promise<ConnectableAccount[]> {
  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
  });
  if (!tokenRes.ok) throw new Error(`LinkedIn rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) throw new Error(`Couldn't read the connected LinkedIn profile (HTTP ${meRes.status})`);
  const me = (await meRes.json()) as { sub: string; name?: string };

  return [{ accountIdentifier: me.sub, label: me.name ?? "LinkedIn profile", credentials: { accessToken: access_token } }];
}

// ---------------------------------------------------------------------------
// Pinterest
// ---------------------------------------------------------------------------

export function getPinterestAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  if (!clientId) throw new Error("Pinterest OAuth isn't configured on this deployment");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state, scope: "boards:read pins:read pins:write" });
  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

export async function exchangePinterestCode(code: string, redirectUri: string): Promise<ConnectableAccount[]> {
  const clientId = process.env.PINTEREST_CLIENT_ID!;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!tokenRes.ok) throw new Error(`Pinterest rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const boardsRes = await fetch("https://api.pinterest.com/v5/boards", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!boardsRes.ok) throw new Error(`Couldn't list Pinterest boards (HTTP ${boardsRes.status})`);
  const boards = (await boardsRes.json()) as { items: { id: string; name: string }[] };

  return boards.items.map((b) => ({ accountIdentifier: b.id, label: b.name, credentials: { accessToken: access_token } }));
}

// ---------------------------------------------------------------------------
// Meta (Facebook Pages + Instagram) - one app, one OAuth surface
// (facebook.com/graph.facebook.com), differing only by scope + which
// entities get listed after exchange.
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "v25.0";
const META_SCOPES: Record<"facebook_page" | "instagram", string> = {
  facebook_page: "pages_manage_posts,pages_show_list,pages_read_engagement",
  instagram: "pages_manage_posts,pages_show_list,pages_read_engagement,instagram_business_content_publish",
};

export function getMetaAuthorizeUrl(platform: "facebook_page" | "instagram", redirectUri: string, state: string): string {
  const clientId = process.env.META_CLIENT_ID;
  if (!clientId) throw new Error("Meta (Facebook/Instagram) OAuth isn't configured on this deployment");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, scope: META_SCOPES[platform] });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function exchangeMetaLongLivedToken(shortLivedToken: string): Promise<string> {
  const clientId = process.env.META_CLIENT_ID!;
  const clientSecret = process.env.META_CLIENT_SECRET!;
  const params = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: clientSecret, fb_exchange_token: shortLivedToken });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Couldn't get a long-lived Meta token (HTTP ${res.status})`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
}

export async function exchangeMetaCode(platform: "facebook_page" | "instagram", code: string, redirectUri: string): Promise<ConnectableAccount[]> {
  const clientId = process.env.META_CLIENT_ID!;
  const clientSecret = process.env.META_CLIENT_SECRET!;
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
  const tokenRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  if (!tokenRes.ok) throw new Error(`Meta rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token: shortLivedToken } = (await tokenRes.json()) as { access_token: string };

  const longLivedUserToken = await exchangeMetaLongLivedToken(shortLivedToken);

  const pagesRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${encodeURIComponent(longLivedUserToken)}`);
  if (!pagesRes.ok) throw new Error(`Couldn't list your Facebook Pages (HTTP ${pagesRes.status})`);
  const pages = (await pagesRes.json()) as { data: MetaPage[] };

  if (platform === "facebook_page") {
    return pages.data.map((p) => ({ accountIdentifier: p.id, label: p.name, credentials: { pageAccessToken: p.access_token } }));
  }

  // instagram - each Page's linked Business/Creator IG account, if any.
  const accounts: ConnectableAccount[] = [];
  for (const page of pages.data) {
    const igRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${page.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`);
    if (!igRes.ok) continue;
    const data = (await igRes.json()) as { instagram_business_account?: { id: string; username: string } };
    if (data.instagram_business_account) {
      accounts.push({ accountIdentifier: data.instagram_business_account.id, label: `@${data.instagram_business_account.username}`, credentials: { accessToken: page.access_token } });
    }
  }
  return accounts;
}

// ---------------------------------------------------------------------------
// Threads - its own OAuth surface (threads.net/graph.threads.net), a
// separate App ID/Secret even though it lives in the same Meta App
// dashboard as Facebook/Instagram.
// ---------------------------------------------------------------------------

export function getThreadsAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.THREADS_CLIENT_ID;
  if (!clientId) throw new Error("Threads OAuth isn't configured on this deployment");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, scope: "threads_basic,threads_content_publish", response_type: "code" });
  return `https://threads.net/oauth/authorize?${params.toString()}`;
}

export async function exchangeThreadsCode(code: string, redirectUri: string): Promise<ConnectableAccount[]> {
  const clientId = process.env.THREADS_CLIENT_ID!;
  const clientSecret = process.env.THREADS_CLIENT_SECRET!;
  const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
  });
  if (!tokenRes.ok) throw new Error(`Threads rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token: shortLivedToken, user_id } = (await tokenRes.json()) as { access_token: string; user_id: string };

  const longLivedRes = await fetch(
    `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(clientSecret)}&access_token=${encodeURIComponent(shortLivedToken)}`,
  );
  const accessToken = longLivedRes.ok ? ((await longLivedRes.json()) as { access_token: string }).access_token : shortLivedToken;

  const meRes = await fetch(`https://graph.threads.net/v1.0/${user_id}?fields=username&access_token=${encodeURIComponent(accessToken)}`);
  const label = meRes.ok ? `@${((await meRes.json()) as { username?: string }).username ?? user_id}` : "Threads profile";

  return [{ accountIdentifier: user_id, label, credentials: { accessToken } }];
}

// ---------------------------------------------------------------------------
// X (Twitter) - the only platform here requiring PKCE. codeVerifier must be
// stashed by the caller (a short-lived httpOnly cookie) between the
// authorize redirect and the callback - see the /connect and /callback
// routes.
// ---------------------------------------------------------------------------

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function getXAuthorizeUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X OAuth isn't configured on this deployment");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: "tweet.read tweet.write users.read offline.access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

export async function exchangeXCode(code: string, redirectUri: string, codeVerifier: string): Promise<ConnectableAccount[]> {
  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
  });
  if (!tokenRes.ok) throw new Error(`X rejected the OAuth code (HTTP ${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${access_token}` } });
  const me = meRes.ok ? ((await meRes.json()) as { data: { username: string } }).data : null;

  return [{ accountIdentifier: me?.username ?? "x-account", label: me ? `@${me.username}` : "X account", credentials: { accessToken: access_token } }];
}

// ---------------------------------------------------------------------------

const CONFIG_ENV: Record<Exclude<SocialOAuthPlatform, "mastodon">, [string, string]> = {
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  pinterest: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
  facebook_page: ["META_CLIENT_ID", "META_CLIENT_SECRET"],
  instagram: ["META_CLIENT_ID", "META_CLIENT_SECRET"],
  threads: ["THREADS_CLIENT_ID", "THREADS_CLIENT_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
};

// Mastodon needs no operator-level config - it's always "configured".
export function isSocialOAuthConfigured(platform: SocialOAuthPlatform): boolean {
  if (platform === "mastodon") return true;
  const [idEnv, secretEnv] = CONFIG_ENV[platform];
  return Boolean(process.env[idEnv] && process.env[secretEnv]);
}

export function getSocialOAuthRedirectUri(): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/integrations/social/callback`;
}
