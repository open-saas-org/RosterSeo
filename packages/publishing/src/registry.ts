import type { BlogAdapter, BlogPlatformDef } from "./types";
import { wordpressAdapter } from "./adapters/wordpress";
import { wordpressComAdapter } from "./adapters/wordpress-com";
import { ghostAdapter } from "./adapters/ghost";
import { tumblrAdapter } from "./adapters/tumblr";
import { devtoAdapter } from "./adapters/devto";
import { hashnodeAdapter } from "./adapters/hashnode";
import { webflowAdapter } from "./adapters/webflow";
import { shopifyAdapter } from "./adapters/shopify";
import { hubspotAdapter } from "./adapters/hubspot";
import { bloggerAdapter } from "./adapters/blogger";

// One entry per supported platform - drives both the Connections page's
// connect forms (credentialFields, or the OAuth button when
// oauthCapable) and which adapter actually sends the post. `gated: true`
// (Blogger only, for now - see that adapter's own comment) means the UI
// shows the platform with its Connect button disabled and a "pending
// Google's approval" note, same pattern as the existing GBP Performance
// card. helpUrl/helpText point at exactly where to get a token for
// platforms with no OAuth option, since that's the real remaining
// friction once WordPress.com/Tumblr have a one-click OAuth path.
export const BLOG_PLATFORMS: BlogPlatformDef[] = [
  {
    id: "wordpress",
    name: "WordPress (self-hosted)",
    logo: "/wordpress.svg",
    authType: "app_password",
    credentialFields: [
      { key: "username", label: "Username", type: "text" },
      { key: "appPassword", label: "Application Password", type: "password" },
    ],
    siteIdentifierLabel: "Site URL",
    gated: false,
    oauthCapable: false,
    helpUrl: "https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/",
    helpText: "In your WordPress admin: Users → Profile → Application Passwords → add a new one.",
  },
  {
    id: "wordpress_com",
    name: "WordPress.com",
    logo: "/wordpress.svg",
    authType: "oauth",
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    siteIdentifierLabel: "Site (e.g. yourblog.wordpress.com)",
    gated: false,
    oauthCapable: true,
  },
  {
    id: "ghost",
    name: "Ghost",
    logo: "/ghost.svg",
    authType: "api_key",
    credentialFields: [{ key: "adminApiKey", label: "Admin API Key (id:secret)", type: "password" }],
    siteIdentifierLabel: "Site URL",
    gated: false,
    oauthCapable: false,
    helpText: "In Ghost Admin: Settings → Integrations → Add custom integration - copy the Admin API Key shown there.",
  },
  {
    id: "tumblr",
    name: "Tumblr",
    logo: "/tumblr.svg",
    authType: "oauth",
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    siteIdentifierLabel: "Blog identifier (e.g. yourblog.tumblr.com)",
    gated: false,
    oauthCapable: true,
  },
  {
    id: "devto",
    name: "Dev.to",
    logo: "/devto.svg",
    authType: "api_key",
    credentialFields: [{ key: "apiKey", label: "API Key", type: "password" }],
    siteIdentifierLabel: "Account label (not required by the API)",
    gated: false,
    oauthCapable: false,
    helpUrl: "https://dev.to/settings/extensions",
    helpText: "Generate a key on the DEV Community Settings → Extensions page.",
  },
  {
    id: "hashnode",
    name: "Hashnode",
    logo: "/hashnode.svg",
    authType: "api_key",
    credentialFields: [{ key: "personalAccessToken", label: "Personal Access Token", type: "password" }],
    siteIdentifierLabel: "Publication ID",
    gated: false,
    oauthCapable: false,
    helpUrl: "https://hashnode.com/settings/developer",
    helpText: "Generate a Personal Access Token on your Hashnode Developer Settings page.",
  },
  {
    id: "webflow",
    name: "Webflow",
    logo: "/webflow.svg",
    authType: "api_key",
    credentialFields: [{ key: "apiToken", label: "Site API Token", type: "password" }],
    siteIdentifierLabel: "Blog Posts Collection ID",
    gated: false,
    oauthCapable: true,
    helpText: "In your Webflow site's dashboard: Site settings → Apps & Integrations → API access - generate a Site API Token.",
  },
  {
    id: "shopify",
    name: "Shopify",
    logo: "/shopify.svg",
    authType: "api_key",
    credentialFields: [
      { key: "accessToken", label: "Admin API Access Token", type: "password" },
      { key: "blogId", label: "Blog ID", type: "text" },
    ],
    siteIdentifierLabel: "Shop domain (e.g. your-store.myshopify.com)",
    gated: false,
    oauthCapable: true,
    helpText: "In your Shopify admin: Settings → Apps and sales channels → Develop apps → create an app with a content write scope.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    logo: "/hubspot.svg",
    authType: "oauth",
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    siteIdentifierLabel: "Blog",
    gated: false,
    oauthCapable: true,
  },
  {
    id: "blogger",
    name: "Blogger",
    logo: "/blogger.svg",
    authType: "oauth",
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    siteIdentifierLabel: "Blog ID",
    gated: true,
    gatedNote: "Not connectable yet - Google requires a manual OAuth sensitive-scope verification (branding review, days to weeks) before this can be used beyond a handful of test accounts.",
    oauthCapable: false,
  },
];

const ADAPTERS: Record<string, BlogAdapter> = {
  wordpress: wordpressAdapter,
  wordpress_com: wordpressComAdapter,
  ghost: ghostAdapter,
  tumblr: tumblrAdapter,
  devto: devtoAdapter,
  hashnode: hashnodeAdapter,
  webflow: webflowAdapter,
  shopify: shopifyAdapter,
  hubspot: hubspotAdapter,
  blogger: bloggerAdapter,
};

export function getBlogAdapter(platform: string): BlogAdapter | undefined {
  return ADAPTERS[platform];
}

export function getBlogPlatformDef(platform: string): BlogPlatformDef | undefined {
  return BLOG_PLATFORMS.find((p) => p.id === platform);
}
