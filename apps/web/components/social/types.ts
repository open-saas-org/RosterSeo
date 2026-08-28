export type SocialPlatformDefView = {
  id: string;
  name: string;
  logo: string;
  authType: "app_password" | "oauth";
  oauthCapable: boolean;
  requiresInstanceUrl: boolean;
  requiresMedia: boolean;
  charLimit?: number;
  credentialFields: { key: string; label: string; type: "text" | "password" | "url" }[];
  accountIdentifierLabel: string;
  accessNote?: string;
};

export type SocialConnectionView = {
  id: string;
  projectId: string;
  platform: string;
  label: string;
  authType: string;
  accountIdentifier: string;
  status: "connected" | "needs_reconnect" | "error";
  lastError: string | null;
  connectedAt: string;
};

export type SocialPostView = {
  id: string;
  projectId: string;
  body: string;
  mediaUrls: string[];
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
  scheduledFor: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostTargetView = {
  id: string;
  socialPostId: string;
  socialConnectionId: string;
  adaptedBody: string;
  status: "pending" | "queued" | "publishing" | "published" | "failed";
  remotePostId: string | null;
  remoteUrl: string | null;
  failureReason: string | null;
  publishedAt: string | null;
  platform: string;
  connectionLabel: string;
};
