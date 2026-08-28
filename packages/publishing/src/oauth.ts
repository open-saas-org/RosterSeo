// Real one-click OAuth for the blog platforms that support it, instead of
// asking every user to go generate and paste a token themselves - the
// whole point of this feature is saving time (see Ghost/Dev.to/Hashnode/
// Webflow/Shopify/HubSpot, which genuinely have no third-party OAuth path
// and still need a manual token - this file only covers the platforms
// where OAuth is real and self-serve).
//
// Same shared-callback, state-carries-context shape as packages/google -
// the operator registers ONE OAuth app per platform (WordPress.com app,
// Tumblr app) with ONE redirect URI, and `state` (base64url JSON) carries
// which project/platform the specific connect request was for.

export type BlogOAuthPlatform = "wordpress_com" | "tumblr" | "hubspot" | "webflow" | "shopify";

interface OAuthPlatformConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scope?: string;
}

const OAUTH_CONFIG: Record<BlogOAuthPlatform, OAuthPlatformConfig> = {
  wordpress_com: {
    authorizeUrl: "https://public-api.wordpress.com/oauth2/authorize",
    tokenUrl: "https://public-api.wordpress.com/oauth2/token",
    clientIdEnv: "WORDPRESS_COM_CLIENT_ID",
    clientSecretEnv: "WORDPRESS_COM_CLIENT_SECRET",
    scope: "global",
  },
  tumblr: {
    authorizeUrl: "https://www.tumblr.com/oauth2/authorize",
    tokenUrl: "https://api.tumblr.com/v2/oauth2/token",
    clientIdEnv: "TUMBLR_CLIENT_ID",
    clientSecretEnv: "TUMBLR_CLIENT_SECRET",
    scope: "basic write offline_access",
  },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    scope: "content",
  },
  webflow: {
    authorizeUrl: "https://webflow.com/oauth/authorize",
    tokenUrl: "https://api.webflow.com/oauth/access_token",
    clientIdEnv: "WEBFLOW_CLIENT_ID",
    clientSecretEnv: "WEBFLOW_CLIENT_SECRET",
    scope: "cms:read cms:write sites:read",
  },
  shopify: {
    // These are dynamic per-shop, we override them in the functions below
    authorizeUrl: "https://{shop}/admin/oauth/authorize",
    tokenUrl: "https://{shop}/admin/oauth/access_token",
    clientIdEnv: "SHOPIFY_CLIENT_ID",
    clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
    scope: "write_content", // For blog posts
  },
};

export function isBlogOAuthConfigured(platform: BlogOAuthPlatform): boolean {
  const cfg = OAUTH_CONFIG[platform];
  return Boolean(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

// No dedicated BLOG_OAUTH_REDIRECT_URI env var - derived from
// BETTER_AUTH_URL, same fallback packages/google's getRedirectUri() uses.
export function getBlogOAuthRedirectUri(): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/integrations/blog/callback`;
}

export function encodeBlogOAuthState(projectId: string, platform: BlogOAuthPlatform, shopDomain?: string): string {
  return Buffer.from(JSON.stringify({ projectId, platform, shopDomain })).toString("base64url");
}

export function decodeBlogOAuthState(raw: string): { projectId: string; platform: BlogOAuthPlatform; shopDomain?: string } {
  const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  if (typeof parsed?.projectId !== "string" || (parsed?.platform !== "wordpress_com" && parsed?.platform !== "tumblr" && parsed?.platform !== "hubspot" && parsed?.platform !== "webflow" && parsed?.platform !== "shopify")) {
    throw new Error("Invalid OAuth state");
  }
  return parsed;
}

export function getBlogOAuthUrl(platform: BlogOAuthPlatform, projectId: string, codeChallenge?: string, shopDomain?: string): string {
  const cfg = OAUTH_CONFIG[platform];
  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) throw new Error(`${platform} OAuth isn't configured on this deployment`);

  if (platform === "shopify" && !shopDomain) {
    throw new Error("shopDomain is required for Shopify OAuth");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getBlogOAuthRedirectUri(),
    response_type: "code",
    state: encodeBlogOAuthState(projectId, platform, shopDomain),
  });
  if (cfg.scope) params.set("scope", cfg.scope);
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  
  const authUrl = platform === "shopify" ? `https://${shopDomain}/admin/oauth/authorize` : cfg.authorizeUrl;
  return `${authUrl}?${params.toString()}`;
}

export async function exchangeBlogOAuthCode(platform: BlogOAuthPlatform, code: string, codeVerifier?: string, shopDomain?: string): Promise<{ accessToken: string }> {
  const cfg = OAUTH_CONFIG[platform];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`${platform} OAuth isn't configured on this deployment`);

  if (platform === "shopify" && !shopDomain) {
    throw new Error("shopDomain is required for Shopify OAuth token exchange");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getBlogOAuthRedirectUri(),
  });
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }
  
  const tokenUrl = platform === "shopify" ? `https://${shopDomain}/admin/oauth/access_token` : cfg.tokenUrl;
  
  const res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!res.ok) throw new Error(`${platform} rejected the OAuth code (HTTP ${res.status})`);
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

// Real sites/blogs this token can actually publish to, fetched right after
// the exchange - lets the callback auto-create one blogConnections row per
// site with zero further manual entry, no separate "which site?" screen.
export async function listBlogOAuthSites(platform: BlogOAuthPlatform, accessToken: string, extra?: { shopDomain?: string }): Promise<{ siteIdentifier: string; label: string }[]> {
  if (platform === "wordpress_com") {
    const res = await fetch("https://public-api.wordpress.com/rest/v1.1/me/sites", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Couldn't list WordPress.com sites (HTTP ${res.status}): ${errorText}`);
    }
    const data = (await res.json()) as { sites: { ID: number; name: string; URL: string }[] };
    return data.sites.map((s) => ({ siteIdentifier: String(s.ID), label: s.name || s.URL }));
  }

  if (platform === "hubspot") {
    const res = await fetch("https://api.hubapi.com/cms/v3/blog-settings/settings", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Couldn't list HubSpot blogs (HTTP ${res.status}): ${errorText}`);
    }
    const data = (await res.json()) as { results: { id: string; name: string }[] };
    return data.results.map((b) => ({ siteIdentifier: b.id, label: b.name }));
  }

  if (platform === "shopify") {
    if (!extra?.shopDomain) throw new Error("shopDomain is required for Shopify");
    const res = await fetch(`https://${extra.shopDomain}/admin/api/2024-01/blogs.json`, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" }
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Couldn't list Shopify blogs (HTTP ${res.status}): ${errorText}`);
    }
    const data = (await res.json()) as { blogs: { id: number; title: string }[] };
    return data.blogs.map((b) => ({ siteIdentifier: String(b.id), label: b.title }));
  }

  if (platform === "webflow") {
    const sitesRes = await fetch("https://api.webflow.com/v2/sites", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!sitesRes.ok) {
      const errorText = await sitesRes.text().catch(() => "");
      throw new Error(`Couldn't list Webflow sites (HTTP ${sitesRes.status}): ${errorText}`);
    }
    // Webflow v2 returns { sites: [...] } where site has id, displayName
    const sitesData = (await sitesRes.json()) as { sites: { id: string; displayName: string }[] };
    
    const collections = [];
    for (const site of sitesData.sites) {
      const colRes = await fetch(`https://api.webflow.com/v2/sites/${site.id}/collections`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (colRes.ok) {
        const colData = (await colRes.json()) as { collections: { id: string; displayName: string }[] };
        for (const col of colData.collections) {
          const nameLower = col.displayName.toLowerCase();
          if (nameLower.includes("blog") || nameLower.includes("post") || nameLower.includes("article")) {
            collections.push({ siteIdentifier: col.id, label: `${site.displayName} - ${col.displayName}` });
          }
        }
      }
    }
    return collections;
  }

  const res = await fetch("https://api.tumblr.com/v2/user/info", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Couldn't list Tumblr blogs (HTTP ${res.status})`);
  const data = (await res.json()) as { response: { user: { blogs: { name: string; title: string }[] } } };
  return data.response.user.blogs.map((b) => ({ siteIdentifier: `${b.name}.tumblr.com`, label: b.title || b.name }));
}
