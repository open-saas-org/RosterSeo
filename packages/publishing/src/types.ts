export type BlogAuthType = "app_password" | "api_key" | "oauth";

export interface BlogPlatformDef {
  id: string;
  name: string;
  logo: string; // path under apps/web/public
  authType: BlogAuthType;
  // Which credential fields the connect form should collect, in order -
  // each becomes a key in the blog_connections.credentials jsonb blob.
  credentialFields: { key: string; label: string; type: "text" | "password" | "url" }[];
  siteIdentifierLabel: string; // what to call the "site URL / blog ID" field for this platform
  gated: boolean; // true = adapter exists but the Connect button ships disabled ("pending approval")
  gatedNote?: string; // shown next to the disabled Connect button, explaining why
  // true = this platform has a real one-click OAuth path (see oauth.ts) -
  // the connect card leads with an OAuth button (zero manual entry, one
  // blogConnections row auto-created per real site/blog the account has)
  // instead of the credentialFields form. The manual form still renders
  // underneath as a fallback for when the operator hasn't configured that
  // platform's OAuth client id/secret.
  oauthCapable: boolean;
  // Direct link to where a user gets their own token/key for this
  // platform, shown next to the manual form so they don't have to hunt
  // through that platform's docs - the real time-saver for platforms with
  // no OAuth option at all.
  helpUrl?: string;
  helpText?: string;
}

export interface BlogPostInput {
  title: string;
  markdown: string; // canonical source
  html: string; // markdownToHtml(markdown) - precomputed once by the caller, for HTML-only platforms
  tags: string[];
}

export interface BlogAdapter {
  platform: string;
  verify(credentials: Record<string, string>, siteIdentifier: string): Promise<void>;
  publish(credentials: Record<string, string>, siteIdentifier: string, post: BlogPostInput): Promise<{ remoteId: string; remoteUrl: string }>;
}
