# Publishing Platform PRD — Publish & Social, enterprise-level

Status: **draft, for reference during implementation** — not yet built.
This document is the single place to check before starting any Publish/
Social work so scope stays consistent across sessions. Update it as
decisions get made or requirements change; don't let the code and this
doc drift apart the way `.env.example`/README drifted from the code
earlier this project.

## Why this exists

Publish and Social work end-to-end today (real adapters, real OAuth, real
scheduling), but next to actual competitors the compose→post→track loop is
thin: no way to see everything you've posted alongside what's coming up,
no way to tell what actually performed once it's live, and the per-platform
editing step is a single review screen rather than a real workspace. This
doc is the researched, concrete requirement set for closing that gap —
"a full publishing platform," in the user's words — not a redesign of what
already works.

## Research: what real tools actually do

Five real products checked directly (not assumed from memory) before
writing any requirement below:

| Product | Model | What it does that RosterSEO doesn't |
|---|---|---|
| [**Posterly**](https://www.poster.ly/) | AI-native, hosted, $7/mo+ | AI Caption Assist tuned per-platform; client approval workflow (client signs in by email, approves/requests changes/comments — no account needed); "best time to post" analytics; AI image/video generation in the composer |
| [**Postiz**](https://postiz.com/) | Open-source (AGPL-3.0), self-hostable — the closest philosophical match to RosterSEO | Drag-and-drop calendar with color-coded categories per channel; per-channel **and** per-post analytics pulled from each network's own official insights API; a Canva-like in-app design tool; a public API + n8n/Make.com automation hooks |
| **Buffer** | Hosted, freemium | Dead-simple queue model (posts just go into a per-channel queue, no manual date-picking needed for the common case) |
| **Metricool / SocialBee** | Hosted | Cross-network analytics as a first-class section, not an afterthought; content categories/buckets for recurring post types |
| **Hootsuite (Perch) / Agorapulse / Planable** | Hosted, team-oriented | Multi-step approval routing; inbox/engagement management (replying to comments — explicitly **not** in scope here, see Non-goals) |

**The one pattern every single one of these shares, that RosterSEO
currently lacks entirely: a unified view of your posts (queue/list +
calendar) sitting between Compose and Analytics, and real performance data
once a post is live.** That's the actual gap — not the composer itself,
which is already ahead of most of these on rich-text/plain-text handling
and real per-platform character limits.

Sources: [poster.ly](https://www.poster.ly/), [poster.ly/agents](https://www.poster.ly/agents), [postiz.com](https://postiz.com/), [Postiz open-source review](https://blog.elest.io/postiz-free-open-source-social-media-scheduler/), [Sprout Social's 2026 scheduling tools roundup](https://sproutsocial.com/insights/social-media-scheduling-tools/), [Planable's 2026 roundup](https://planable.io/blog/schedule-social-media-posts/).

## Current state in RosterSEO (verified against the code, not assumed)

- **Compose**: real, already good — rich-text editor for Publish (Markdown
  in/out), plain-text with live per-platform character-limit counter for
  Social, platform-icon picker, saved platform-combination templates,
  emoji picker, an "Edit content/image per platform" toggle that routes to
  a per-target AI-respin review screen.
- **Posts list**: exists for both pillars, with a List/Calendar toggle
  (`PostCalendar`) — but the calendar is a bare month grid with status
  dots, no "what's coming up next" view, no click-to-open composer, no
  drag-to-reschedule.
- **Analytics**: **does not exist for Social or Publish at all.** Every
  "Analytics"/"Insights" page in the app today (GSC, GA4, Bing, Merchant)
  is first-party website search analytics — none of them touch a social
  platform's own engagement data. Confirmed by grep: there is no
  reach/engagement/follower/impressions fetch anywhere in
  `packages/social` or the Social API routes.
- **Media**: a single "Image URL" text field — no upload, no library, no
  reuse across posts.

## Requirements

### 1. Compose — incremental, not a rebuild

- [ ] After creating/scheduling a post, land on the **Posts** view (list
  or calendar, whichever was last used) with the new post visible and
  briefly highlighted — not a dead-end confirmation screen. This is the
  literal "feels very empty" complaint: right now there's no obvious next
  step after composing.
- [ ] Composer opens **from** a post row too (click any upcoming/draft
  post in Posts → reopens Compose pre-filled, editable) — today editing
  only exists via the separate per-platform review screen once a post
  already has targets.
- [ ] Keep the existing per-platform AI-respin review screen — Posterly's
  client-approval flow and Postiz's per-post analytics both assume a
  similar "one post, many platform-specific versions" model, so this is
  already the right shape, just needs to be reachable from more places
  (see above).

### 2. Posts — a real workspace, not just two views bolted together

Modeled directly on Postiz's calendar + Posterly's "Up next" pattern,
adapted to real RosterSEO data:

- [ ] **Calendar tab**: drag-and-drop to reschedule (writes a new
  `scheduledFor`, calls the same publish/schedule endpoint that already
  exists — no new backend concept, just a UI affordance over it), a
  color per platform (not just per status as today), click a day to see
  that day's posts inline rather than only via the existing side list.
- [ ] **"Up next" widget** (visible on both List and Calendar): the next
  5-10 scheduled posts across both pillars, soonest first, each showing
  platform icon, a truncated preview, and relative time ("in 4 hours").
  This is a new small shared query (`scheduledFor > now()`, both
  `social_posts` and `blog_posts`, ordered ascending, limited) — cheap to
  build, high value, directly addresses "show list of posts."
- [ ] **Inspector panel**: selecting a post (from either view) shows its
  full detail — status per target, real error messages for failed
  targets, a direct edit/respin entry point — without a full page
  navigation. This can reuse the existing per-platform review components,
  just rendered in a side panel instead of a standalone route.
- [ ] **Bulk actions** on the List view: multi-select + bulk delete/
  reschedule, same interaction pattern Rank Tracking's table already uses
  elsewhere in this app (`rank-tracking-table.tsx`) — reuse that pattern,
  don't invent a new one.
- [ ] **Filters**: by platform, by status, by pillar (Publish vs Social) —
  the List view currently has none.

### 3. Analytics — new, real, honest about what each platform actually allows

This is the biggest real gap and the one requiring the most care, because
**not every platform's API actually returns the same data** — this section
has to stay true to that instead of faking a uniform dashboard:

| Platform | Real analytics available via API? | Notes |
|---|---|---|
| Facebook Pages / Instagram | Yes — Graph API Insights (`/insights` edge) | Reach, impressions, engagement per post; requires the same Page/IG connection already built |
| LinkedIn | Yes — Organic Share Statistics API | Impressions, clicks, engagement per share; separate scope from posting |
| X | Limited — metrics require a paid API tier | Confirm current tier requirements before promising this one; may need to ship as "requires your own paid X API access," same honesty pattern as X's per-post pricing already documented |
| Threads | Yes — Threads Insights API | Views, likes, replies, reposts per post |
| Pinterest | Yes — Pin analytics API | Impressions, saves, clicks per Pin |
| Bluesky | No real per-post analytics API today | Show like/repost/reply counts only if/when the AT Protocol exposes them reliably — don't fabricate a dashboard around a platform that can't back it |
| Mastodon | Instance-dependent, generally minimal | Favourites/boosts/replies counts only, per-instance API |
| Blog platforms (Publish) | Not applicable the same way | Traffic to a published post is already covered by GSC/GA4 Insights if the post URL is indexed — cross-link rather than duplicate |

Requirements:

- [ ] One **Analytics** page per pillar (or a shared one with a
  Publish/Social toggle, matching Insights' existing per-platform-tab
  pattern) with real KPI cards (Reach, Engagement, Followers where the
  platform provides it) — each card shows an honest "not available for
  this platform" state rather than a zero, exactly this codebase's
  existing convention for every other integration.
- [ ] A per-post performance view reachable from the Inspector panel
  (§2) — once a post is live, show its real per-platform numbers next to
  the copy that was actually sent.
- [ ] A trend chart (reach/engagement over time) — reuse the dataviz
  skill's chart guidance already applied elsewhere in this app (Rank
  Tracking's position-distribution chart, AI Visibility's trend areas) for
  a consistent look, not a new charting pattern.
- [ ] New DB surface needed: a `social_post_metrics` (and equivalent
  blog-side, if in scope) table keyed by target, storing fetched
  snapshots — analytics data isn't queryable live from most of these APIs
  per-request at dashboard-refresh speed, so this needs a background job
  (pg-boss, same pattern as `apps/worker`) polling each connected
  platform's insights endpoint on a schedule, not a live fetch per page
  load.

## Non-goals (explicitly out of scope unless you ask otherwise)

- **Inbox/engagement management** (replying to comments/DMs from inside
  RosterSEO) — Hootsuite/Agorapulse do this; it's a materially different
  feature (needs read/write access to comments, real-time-ish polling)
  and wasn't part of the ask.
- **Client approval portal** (Posterly's no-account client review link) —
  genuinely useful for agencies, but a separate auth/sharing model from
  anything in this app today. Flag as a real future candidate, not
  building now.
- **Media Library, Link in Bio, Thumbnail Creator, AI image/video
  generation** — all real features in the screenshots you shared, but
  outside "compose, Posts, and analytics" as you scoped it. Worth their
  own PRD later if wanted.
- **A generic Canva-like design tool** (Postiz has one) — large scope on
  its own, not assumed here.

## Suggested phasing

1. **Posts workspace** (§2) — "Up next" widget + Inspector panel + compose
   landing on Posts instead of a dead end. No new integrations needed,
   directly fixes "feels very empty," and is the foundation the Analytics
   Inspector view (§3) builds on.
2. **Analytics, platform-by-platform** — start with Facebook Pages/
  Instagram and LinkedIn (both have straightforward, well-documented
  insights APIs and are already-built connections), not all 8 platforms
  at once.
3. **Calendar drag-and-drop + bulk actions** — polish once the workspace
   shape is proven.

## Open questions to resolve before implementation starts

- Which platforms' analytics matter most to you first — pick from the
  table in §3 rather than building all 8 at once.
- Is a client-facing approval portal (Non-goals) actually wanted later? It
  changes the auth model enough to be worth deciding early even if not
  built now.
- Confirm X's current API access tier/cost before committing to X
  analytics specifically — this one has real, possibly-expensive
  prerequisites unlike the others.
