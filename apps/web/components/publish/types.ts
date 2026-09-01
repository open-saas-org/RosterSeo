export type BlogPlatformDefView = {
  id: string;
  name: string;
  logo: string;
  authType: "app_password" | "api_key" | "oauth";
  credentialFields: { key: string; label: string; type: "text" | "password" | "url" }[];
  siteIdentifierLabel: string;
  gated: boolean;
  gatedNote?: string;
  oauthCapable: boolean;
  helpUrl?: string;
  helpText?: string;
};

export type BlogPlatformTemplateView = {
  id: string;
  projectId: string;
  name: string;
  connectionIds: string[];
  createdAt: string;
};

export type BlogConnectionView = {
  id: string;
  projectId: string;
  platform: string;
  label: string;
  authType: string;
  siteIdentifier: string;
  status: "connected" | "needs_reconnect" | "error";
  lastError: string | null;
  connectedAt: string;
};

export type BlogPostView = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  tags: string[];
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
  scheduledFor: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostTargetView = {
  id: string;
  blogPostId: string;
  blogConnectionId: string;
  adaptedTitle: string;
  adaptedBody: string;
  status: "pending" | "queued" | "publishing" | "published" | "failed";
  remotePostId: string | null;
  remoteUrl: string | null;
  failureReason: string | null;
  publishedAt: string | null;
  platform: string;
  connectionLabel: string;
};
