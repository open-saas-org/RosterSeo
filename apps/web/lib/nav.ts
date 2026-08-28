import {
  LayoutDashboard,
  Wand2,
  Search,
  Link2,
  Swords,
  Sparkles,
  BarChart3,
  TrendingUp,
  ListChecks,
  Bot,
  Plug,
  Boxes,
  HelpCircle,
  Settings,
  Megaphone,
  Network,
  Target,
  Building,
  Building2,
  ListTree,
  Server,
  Eye,
  MapPinned,
  Mail,
  Wallet,
  PenSquare,
  Newspaper,
  Share2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  /** Either this or `imageIcon` must be set - `imageIcon` (a real brand mark) takes precedence when both are. */
  icon?: LucideIcon;
  /** Real brand SVG (e.g. Google Analytics' own mark) instead of a generic Lucide icon - used for the Insights group, where showing each connected service's actual logo reads better than an abstract chart icon. */
  imageIcon?: string;
  badge?: string;
  /** Top-bar-only: renders as an icon with no label (plus a hover tooltip), instead of the default icon+label. */
  iconOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type NavPillar = {
  id: "seo" | "publish" | "social";
  label: string;
  groups: NavGroup[];
};

// The sidebar's "Grow" mode (see sidebar-mode-tabs.tsx) switches between
// these three pillars via a small segmented control rendered above the nav
// groups (app-sidebar.tsx) - one cohesive "grow the site" tool instead of
// three separate products. SEO is today's entire nav, unchanged, just
// wrapped; Publish and Social are new.
export const navPillars: NavPillar[] = [
  {
    id: "seo",
    label: "SEO",
    groups: [
      {
        // My Site / Research / Connect grouping, with My Site leading since
        // it's the project's own real connected data -
        // Dashboard lives here too now rather than a separate one-item "Overview"
        // group. Our own modules (Page Analyzer, Competitors, Local SEO, AI
        // Visibility, Integrations) are folded into whichever group they fit,
        // rather than kept as a separate "our stuff" bucket.
        label: "My Site",
        items: [
          { title: "Dashboard", href: "/", icon: LayoutDashboard },
          { title: "Site Audit", href: "/site-audit", icon: ListChecks, badge: "New" },
          { title: "Page Analyzer", href: "/page-analyzer", icon: Wand2, badge: "Flagship" },
          { title: "Rank Tracking", href: "/rank-tracking", icon: TrendingUp },
        ],
      },
      {
        label: "Insights",
        items: [
          { title: "Search Console", href: "/gsc-insights", imageIcon: "/search-console.svg" },
          { title: "Analytics", href: "/ga-insights", imageIcon: "/google-analytics.svg" },
          { title: "Bing", href: "/bing-insights", imageIcon: "/bing.svg" },
          { title: "Merchant Center", href: "/merchant-insights", imageIcon: "/google-merchant.svg" },
        ],
      },
      {
        label: "Research",
        items: [
          { title: "Keyword Research", href: "/keyword-research", icon: Search },
          { title: "Backlinks", href: "/backlinks", icon: Link2 },
          { title: "Outreach", href: "/outreach", icon: Mail },
          { title: "Competitors", href: "/competitors", icon: Swords },
          { title: "Brand Lookup", href: "/brand-lookup", icon: Sparkles },
        ],
      },
      {
        // Promoted from a single "My Site" item to its own group once it grew
        // real Grid Ranking (map) and Business Profile (GBP connection)
        // sub-pages - same reasoning as the AI Visibility promotion above.
        label: "Local SEO",
        items: [
          { title: "Profile", href: "/local-seo", icon: Building2 },
          { title: "Monitor", href: "/local-seo/monitor", icon: MapPinned },
          { title: "Optimize", href: "/local-seo/optimize", icon: Sparkles },
        ],
      },
      {
        // One group for the whole AI Visibility tool's views. Its own settings
        // (Brand, Competitors, Providers) live as shortcuts in navTopBar
        // instead of here - see the comment there. Styled identically to every
        // other group/shortcut in the app - one color combination throughout,
        // not a different accent per module.
        label: "AI Visibility",
        items: [
          { title: "Overview", href: "/ai-visibility/overview", icon: Eye },
          { title: "Visibility", href: "/ai-visibility/visibility", icon: BarChart3 },
          { title: "Share of Voice", href: "/ai-visibility/share-of-voice", icon: Megaphone },
          { title: "Query Fan-Out", href: "/ai-visibility/query-fan-out", icon: Network },
          { title: "Citations", href: "/ai-visibility/citations", icon: Link2 },
          { title: "Opportunities", href: "/ai-visibility/opportunities", icon: Target },
          { title: "Prompts", href: "/ai-visibility/settings/prompts", icon: ListTree },
        ],
      },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    groups: [
      {
        label: "Publish",
        items: [
          { title: "Compose", href: "/publish", icon: PenSquare },
          { title: "Posts", href: "/publish/posts", icon: Newspaper },
          { title: "Connections", href: "/publish/connections", icon: Plug },
        ],
      },
    ],
  },
  {
    id: "social",
    label: "Social",
    groups: [
      {
        label: "Social",
        items: [
          { title: "Compose", href: "/social", icon: PenSquare },
          { title: "Posts", href: "/social/posts", icon: Share2 },
          { title: "Connections", href: "/social/connections", icon: Plug },
        ],
      },
    ],
  },
];

// Rendered as icon buttons in the top header, right before the light/dark
// toggle - not in the sidebar. These are app-level/utility destinations
// (connect integrations, MCP setup, help, settings), not a project-scoped
// research/reporting module, so they don't compete for sidebar space with
// the feature groups above.
//
// Brand, Competitors, and Providers are quick-access shortcuts to
// AI Visibility's own settings pages - a project's brand identity, who it's
// compared against, and which providers it samples from are worth reaching
// in one click, not three levels deep in the sidebar. Styled the same as
// every other top-bar item (no special accent) - one color combination
// throughout the app, not a different one for AI-related destinations.
// Clay (the AI assistant) and Settings are icon-only (a hover tooltip still
// names each) since their icons read on their own and this keeps the always-
// visible assistant entry from crowding the rest of the bar; everything
// else keeps its label.
export const navTopBar: NavItem[] = [
  { title: "Brand", href: "/ai-visibility/settings/brand", icon: Building },
  { title: "Competitors", href: "/competitors", icon: Building2 },
  { title: "Providers", href: "/ai-visibility/settings/providers", icon: Server },
  { title: "Integrations", href: "/integrations", icon: Plug },
  { title: "AI & MCP", href: "/ai-mcp", icon: Boxes },
  { title: "Spend", href: "/spend", icon: Wallet },
];
