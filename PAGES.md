# RosterSEO — Complete Pages & Route Hierarchy

This document lists every page in the RosterSEO project (`apps/web` and `apps/docs`), organized by route hierarchy, navigation pillar, and access rules.

---

## 1. `apps/web` — Main Application (`http://localhost:3000`)

### 1.1 Standalone & Public Pages (Outside `(dashboard)`)

| Route | File | Auth / Mode | Purpose |
| :--- | :--- | :--- | :--- |
| `/login` | `apps/web/app/(auth)/login/page.tsx` | Public (redirects to `/` if signed in) | Email/password sign-in (`better-auth`) |
| `/signup` | `apps/web/app/(auth)/signup/page.tsx` | Public (redirects to `/` if signed in) | Account registration + auto workspace/org creation |
| `/onboarding` | `apps/web/app/onboarding/page.tsx` | Authenticated | First-project setup wizard for new accounts |
| `/pricing` | `apps/web/app/pricing/page.tsx` | Authenticated, `SELF_HOSTED=false` only (redirects to `/` if self-hosted) | Full-screen, distraction-free upgrade page with Starter (\$10), Pro (\$20), and Agency (\$40) Cashfree plans |
| `/reports/ai-visibility/[projectId]` | `apps/web/app/reports/ai-visibility/[projectId]/page.tsx` | Public via share token | Publicly shareable AI Visibility report for a project |

> **Layouts:**
> - Root layout: `apps/web/app/layout.tsx` (and `apps/web/app/global-error.tsx`)
> - Auth layout: `apps/web/app/(auth)/layout.tsx`

---

### 1.2 Dashboard Shell (`apps/web/app/(dashboard)/layout.tsx`)

All routes below are wrapped in the dashboard shell (Sidebar + `SiteHeader` + optional warm upgrade banner when `SELF_HOSTED=false` and not on an active paid plan). Also includes `error.tsx` and `loading.tsx`.

#### A. SEO Pillar — **My Site**
| Route | File | Purpose |
| :--- | :--- | :--- |
| `/` | `apps/web/app/(dashboard)/page.tsx` | Main project dashboard overview |
| `/site-audit` | `apps/web/app/(dashboard)/site-audit/page.tsx` | Site crawler & technical SEO audit list/launcher |
| `/site-audit/[auditId]/deep-check` | `apps/web/app/(dashboard)/site-audit/[auditId]/deep-check/page.tsx` | Deep check analysis on a completed audit's crawl data |
| `/site-audit/[auditId]/pages/[pageId]` | `apps/web/app/(dashboard)/site-audit/[auditId]/pages/[pageId]/page.tsx` | Individual crawled page audit details & inbound links |
| `/page-analyzer` | `apps/web/app/(dashboard)/page-analyzer/page.tsx` | Single-URL SEO, PageSpeed/CWV & content analyzer |
| `/rank-tracking` | `apps/web/app/(dashboard)/rank-tracking/page.tsx` | Daily/on-demand Google keyword rank tracker |

#### B. SEO Pillar — **Insights** (Connected Analytics & Search Data)
| Route | File | Purpose |
| :--- | :--- | :--- |
| `/gsc-insights` | `apps/web/app/(dashboard)/gsc-insights/page.tsx` | Google Search Console clicks, impressions, CTR & position |
| `/ga-insights` | `apps/web/app/(dashboard)/ga-insights/page.tsx` | Google Analytics 4 organic sessions & landing pages |
| `/bing-insights` | `apps/web/app/(dashboard)/bing-insights/page.tsx` | Bing Webmaster Tools search performance |
| `/merchant-insights` | `apps/web/app/(dashboard)/merchant-insights/page.tsx` | Google Merchant Center performance & product insights |

#### C. SEO Pillar — **Research**
| Route | File | Purpose |
| :--- | :--- | :--- |
| `/keyword-research` | `apps/web/app/(dashboard)/keyword-research/page.tsx` | Keyword volume, CPC, competition & ideas |
| `/backlinks` | `apps/web/app/(dashboard)/backlinks/page.tsx` | Domain backlink profile & referring domains |
| `/outreach` | `apps/web/app/(dashboard)/outreach/page.tsx` | Backlink outreach targets & email campaigns |
| `/competitors` | `apps/web/app/(dashboard)/competitors/page.tsx` | Competitor domain tracking & comparison |
| `/competitors/[id]` | `apps/web/app/(dashboard)/competitors/[id]/page.tsx` | Detailed traffic, keyword & backlink view for a competitor |
| `/brand-lookup` | `apps/web/app/(dashboard)/brand-lookup/page.tsx` | Quick domain/brand SEO snapshot lookup |

#### D. SEO Pillar — **Local SEO**
| Route | File | Purpose |
| :--- | :--- | :--- |
| `/local-seo` | `apps/web/app/(dashboard)/local-seo/page.tsx` | Google Business Profile & local business settings |
| `/local-seo/monitor` | `apps/web/app/(dashboard)/local-seo/monitor/page.tsx` | Local map-pack grid rank monitoring |
| `/local-seo/optimize` | `apps/web/app/(dashboard)/local-seo/optimize/page.tsx` | Local SEO optimization strategy & recommendations |

#### E. SEO Pillar — **AI Visibility**
| Route | File | Purpose |
| :--- | :--- | :--- |
| `/ai-visibility` | `apps/web/app/(dashboard)/ai-visibility/page.tsx` | AI Visibility index (redirects/entry) |
| `/ai-visibility/overview` | `apps/web/app/(dashboard)/ai-visibility/overview/page.tsx` | High-level AI answer-engine visibility summary |
| `/ai-visibility/visibility` | `apps/web/app/(dashboard)/ai-visibility/visibility/page.tsx` | Prompt-level brand visibility across LLMs |
| `/ai-visibility/visibility/[promptId]` | `apps/web/app/(dashboard)/ai-visibility/visibility/[promptId]/page.tsx` | Individual prompt LLM run responses & history |
| `/ai-visibility/share-of-voice` | `apps/web/app/(dashboard)/ai-visibility/share-of-voice/page.tsx` | Brand vs. competitor share of voice in AI answers |
| `/ai-visibility/query-fan-out` | `apps/web/app/(dashboard)/ai-visibility/query-fan-out/page.tsx` | Captured web search queries triggered by AI prompts |
| `/ai-visibility/citations` | `apps/web/app/(dashboard)/ai-visibility/citations/page.tsx` | Sources & URLs cited by AI engines |
| `/ai-visibility/opportunities` | `apps/web/app/(dashboard)/ai-visibility/opportunities/page.tsx` | LLM-generated content & citation opportunities |
| `/ai-visibility/settings/prompts` | `apps/web/app/(dashboard)/ai-visibility/settings/prompts/page.tsx` | Manage tracked AI prompts |
| `/ai-visibility/settings/brand` | `apps/web/app/(dashboard)/ai-visibility/settings/brand/page.tsx` | Brand identity & aliases for AI tracking |
| `/ai-visibility/settings/providers` | `apps/web/app/(dashboard)/ai-visibility/settings/providers/page.tsx` | Configure LLM/scraper providers (OpenRouter, BrightData, etc.) |

---

### 1.3 Publish Pillar (`apps/web/app/(dashboard)/publish/layout.tsx`)

| Route | File | Purpose |
| :--- | :--- | :--- |
| `/publish` | `apps/web/app/(dashboard)/publish/page.tsx` | Multi-platform blog post composer |
| `/publish/posts` | `apps/web/app/(dashboard)/publish/posts/page.tsx` | List of drafted, scheduled & published blog posts |
| `/publish/posts/[postId]` | `apps/web/app/(dashboard)/publish/posts/[postId]/page.tsx` | Individual blog post status, targets & details |
| `/publish/connections` | `apps/web/app/(dashboard)/publish/connections/page.tsx` | Connect blog platforms (WordPress, Ghost, Tumblr, Dev.to, Hashnode, Webflow, Shopify, HubSpot, Blogger) |

---

### 1.4 Social Pillar (`apps/web/app/(dashboard)/social/layout.tsx`)

| Route | File | Purpose |
| :--- | :--- | :--- |
| `/social` | `apps/web/app/(dashboard)/social/page.tsx` | Multi-platform social post composer |
| `/social/posts` | `apps/web/app/(dashboard)/social/posts/page.tsx` | List of drafted, scheduled & published social posts |
| `/social/posts/[postId]` | `apps/web/app/(dashboard)/social/posts/[postId]/page.tsx` | Individual social post details & delivery status |
| `/social/analytics` | `apps/web/app/(dashboard)/social/analytics/page.tsx` | Social post engagement & performance analytics |
| `/social/connections` | `apps/web/app/(dashboard)/social/connections/page.tsx` | Connect social platforms (Bluesky, Mastodon, LinkedIn, Pinterest, Facebook, Instagram, Threads, X) |

---

### 1.5 Top-Bar, Assistant, Settings & Utility Pages

| Route | File | Auth / Mode | Purpose |
| :--- | :--- | :--- | :--- |
| `/cappy` | `apps/web/app/(dashboard)/cappy/page.tsx` | Authenticated | Cappy AI SEO assistant chat workspace |
| `/integrations` | `apps/web/app/(dashboard)/integrations/page.tsx` | Authenticated | Google OAuth (GSC, GA4, GBP, Merchant Center) & global API connections |
| `/ai-mcp` | `apps/web/app/(dashboard)/ai-mcp/page.tsx` | Authenticated | MCP server setup & API key management |
| `/spend` | `apps/web/app/(dashboard)/spend/page.tsx` | Authenticated | Instance-wide external API spend tracker |
| `/settings` | `apps/web/app/(dashboard)/settings/page.tsx` | Authenticated | Workspace & project settings |
| `/settings/billing` | `apps/web/app/(dashboard)/settings/billing/page.tsx` | Authenticated, `SELF_HOSTED=false` only (redirects to `/` if self-hosted) | Current plan, Cashfree subscription management & monthly usage meters |
| `/help` | `apps/web/app/(dashboard)/help/page.tsx` | Authenticated | In-app help & documentation links |

---

## 2. `apps/docs` — Documentation Site (`http://localhost:3001`, proxied at `/docs`)

Built with Fumadocs (`apps/docs/src/app/(home)/page.tsx` and `apps/docs/src/app/docs/[[...slug]]/page.tsx`):

- **Home & Overview**: `index.mdx`
- **AI Visibility**: `ai-visibility/index.mdx`
- **Connected Data**: `connected-data/integrations.mdx`, `gsc-insights.mdx`, `ga-insights.mdx`, `bing-insights.mdx`, `merchant-insights.mdx`
- **Deploy**: `deploy/self-hosting.mdx`, `environment-variables.mdx`, `migrations.mdx`
- **Platform**: `platform/architecture.mdx`, `cappy.mdx`, `ai-mcp.mdx`, `outreach.mdx`, `spend.mdx`, `settings.mdx`
- **SEO**: `seo/page-analyzer.mdx`, `site-audit.mdx`, `keyword-research.mdx`, `rank-tracking.mdx`, `backlinks.mdx`, `competitors.mdx`, `brand-lookup.mdx`, `local-seo.mdx`
- **Publish**: `publish/overview.mdx`, `wordpress.mdx`, `wordpress-com.mdx`, `ghost.mdx`, `tumblr.mdx`, `devto.mdx`, `hashnode.mdx`, `webflow.mdx`, `shopify.mdx`, `hubspot.mdx`, `blogger.mdx`
- **Social**: `social/overview.mdx`, `bluesky.mdx`, `mastodon.mdx`, `linkedin.mdx`, `pinterest.mdx`, `facebook.mdx`, `instagram.mdx`, `threads.mdx`, `x.mdx`
