export type SocialAuthType = "app_password" | "oauth";

export interface SocialPlatformDef {
  id: string;
  name: string;
  logo: string; // path under apps/web/public
  authType: SocialAuthType;
  oauthCapable: boolean; // real one-click OAuth exists (see oauth.ts) vs a manual credentials form
  requiresInstanceUrl: boolean; // Mastodon only - the connect flow needs an instance URL before it can even start
  requiresMedia: boolean; // Pinterest/Instagram can't post without an image
  charLimit?: number; // guidance for the AI respin prompt, not hard-enforced
  // Manual-entry fallback fields (used when oauthCapable is false, or as a
  // secondary path when the operator hasn't configured that platform's
  // OAuth client id/secret).
  credentialFields: { key: string; label: string; type: "text" | "password" | "url" }[];
  accountIdentifierLabel: string;
  // When the account identifier is just one of the credential fields above
  // re-used for display (e.g. Bluesky's handle doubles as both the login
  // credential and the human-readable identifier), set this to that
  // field's key instead of duplicating it as a second input the user has
  // to fill in twice. Leave unset for platforms where the identifier is
  // genuinely separate from any credential (e.g. LinkedIn's Person ID vs.
  // its Access Token).
  accountIdentifierSource?: string;
  // Unlike Blogger in Publish, none of these platforms are hard-blocked
  // pending approval - Meta's Standard Access and X's billing both work
  // immediately for your own accounts. accessNote surfaces a real caveat
  // (cost, or an access-tier limit) without disabling the Connect button -
  // an informed choice, not a block.
  accessNote?: string;
}

export interface SocialPostInput {
  text: string;
  mediaUrls: string[];
}

// Every field is optional/undefined (never fabricated as 0) when a
// platform's real API genuinely doesn't return it for that post type -
// see PUBLISHING_PLATFORM_PRD.md §3's per-platform table, and each
// implementing adapter's own fetchMetrics() comment for exactly which
// fields it can honestly provide.
export interface SocialPostMetrics {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
}

export interface SocialAdapter {
  platform: string;
  verify(credentials: Record<string, string>, accountIdentifier: string): Promise<void>;
  publish(credentials: Record<string, string>, accountIdentifier: string, post: SocialPostInput): Promise<{ remoteId: string; remoteUrl: string }>;
  // Optional: only Facebook Page/Instagram/LinkedIn implement this today
  // (PUBLISHING_PLATFORM_PRD.md §3's chosen first phase) - every other
  // adapter simply omits it, and callers must check for its presence
  // before calling (see packages/jobs' socialMetricsFetchJob consumer).
  fetchMetrics?(credentials: Record<string, string>, remotePostId: string): Promise<SocialPostMetrics>;
}
