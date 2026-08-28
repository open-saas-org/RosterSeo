import type { SocialAdapter, SocialPlatformDef } from "./types";
import { blueskyAdapter } from "./adapters/bluesky";
import { mastodonAdapter } from "./adapters/mastodon";
import { linkedinAdapter } from "./adapters/linkedin";
import { pinterestAdapter } from "./adapters/pinterest";
import { facebookPageAdapter } from "./adapters/facebook-page";
import { instagramAdapter } from "./adapters/instagram";
import { threadsAdapter } from "./adapters/threads";
import { xAdapter } from "./adapters/x";

// TikTok is deliberately not here - it's video-only (Content Posting API
// has no text/image post type), which doesn't fit "write one update, post
// it everywhere" the way every platform below does. Reddit is excluded
// too: its 2026 "Responsible Builder Policy" closed self-service app
// registration, and commercial use effectively requires a ~$12k/month
// tier - not viable for a self-hosted open-source tool. YouTube Community
// posts and Snapchat have no public posting API at all.
export const SOCIAL_PLATFORMS: SocialPlatformDef[] = [
  {
    id: "bluesky",
    name: "Bluesky",
    logo: "/bluesky.svg",
    authType: "app_password",
    oauthCapable: false,
    requiresInstanceUrl: false,
    requiresMedia: false,
    charLimit: 300,
    credentialFields: [
      { key: "handle", label: "Handle (e.g. you.bsky.social)", type: "text" },
      { key: "appPassword", label: "App Password", type: "password" },
    ],
    accountIdentifierLabel: "Handle (same as above)",
  },
  {
    id: "mastodon",
    name: "Mastodon",
    logo: "/mastodon.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: true,
    requiresMedia: false,
    charLimit: 500,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Instance URL (e.g. https://mastodon.social)",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    logo: "/linkedin.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: false,
    charLimit: 3000,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Person ID",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    logo: "/pinterest.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: true,
    charLimit: 500,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Board ID",
  },
  {
    id: "facebook_page",
    name: "Facebook Page",
    logo: "/facebook.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: false,
    credentialFields: [{ key: "pageAccessToken", label: "Page Access Token", type: "password" }],
    accountIdentifierLabel: "Page ID",
    accessNote: "Works immediately for Pages you admin. Posting to other people's Pages needs Meta's Advanced Access review.",
  },
  {
    id: "instagram",
    name: "Instagram",
    logo: "/instagram.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: true,
    charLimit: 2200,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Instagram Business Account ID",
    accessNote: "Needs a Business/Creator account linked to a Facebook Page. Works immediately for your own account; other users' accounts need Meta's Advanced Access review.",
  },
  {
    id: "threads",
    name: "Threads",
    logo: "/threads.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: false,
    charLimit: 500,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Threads User ID",
  },
  {
    id: "x",
    name: "X (Twitter)",
    logo: "/x.svg",
    authType: "oauth",
    oauthCapable: true,
    requiresInstanceUrl: false,
    requiresMedia: false,
    charLimit: 280,
    credentialFields: [{ key: "accessToken", label: "Access Token", type: "password" }],
    accountIdentifierLabel: "Username",
    accessNote: "X charges per post (no free tier) - $0.015/post, $0.20 if it contains a link. Connect only if you've funded a prepaid balance on your X developer account.",
  },
];

const ADAPTERS: Record<string, SocialAdapter> = {
  bluesky: blueskyAdapter,
  mastodon: mastodonAdapter,
  linkedin: linkedinAdapter,
  pinterest: pinterestAdapter,
  facebook_page: facebookPageAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
  x: xAdapter,
};

export function getSocialAdapter(platform: string): SocialAdapter | undefined {
  return ADAPTERS[platform];
}

export function getSocialPlatformDef(platform: string): SocialPlatformDef | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.id === platform);
}
