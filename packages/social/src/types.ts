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

export interface SocialAdapter {
  platform: string;
  verify(credentials: Record<string, string>, accountIdentifier: string): Promise<void>;
  publish(credentials: Record<string, string>, accountIdentifier: string, post: SocialPostInput): Promise<{ remoteId: string; remoteUrl: string }>;
}
