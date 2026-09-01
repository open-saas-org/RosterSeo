import Link from 'next/link';
import type { SVGProps } from 'react';
import {
  ArrowRight,
  Search,
  Newspaper,
  Bot,
  Users,
  Link2,
  Building2,
  MapPin,
  BarChart3,
  LineChart,
  TrendingUp,
  ShoppingBag,
  Puzzle,
  Server,
  GitBranch,
  Settings,
  Layers,
  Share2,
  FileText,
  MessageSquare,
  Mail,
  DollarSign,
} from 'lucide-react';
import { source } from '@/lib/source';
import { gitConfig } from '@/lib/shared';

// Real frontmatter (title/description) for every page, grouped for the
// homepage instead of dumped as one flat list - the grouping and icon per
// path are the only hand-authored bits here, the copy itself comes
// straight from each page's own description. Keyed by full slug path
// (not just the last segment) since Publish/Social both have an
// "overview" page - a last-segment-only key would collide between them.
const GROUPS: { label: string; paths: string[] }[] = [
  { label: 'Deploy', paths: ['deploy/self-hosting', 'deploy/environment-variables', 'platform/architecture', 'deploy/migrations'] },
  {
    label: 'SEO tools',
    paths: [
      'seo/page-analyzer',
      'seo/site-audit',
      'seo/rank-tracking',
      'seo/keyword-research',
      'seo/competitors',
      'seo/backlinks',
      'seo/local-seo',
      'seo/brand-lookup',
    ],
  },
  { label: 'AI Visibility', paths: ['ai-visibility'] },
  { label: 'Publish', paths: ['publish/overview'] },
  { label: 'Social', paths: ['social/overview'] },
  { label: 'Connected data', paths: ['connected-data/integrations', 'connected-data/gsc-insights', 'connected-data/ga-insights', 'connected-data/bing-insights', 'connected-data/merchant-insights'] },
  { label: 'Platform', paths: ['platform/cappy', 'platform/outreach', 'platform/spend', 'platform/ai-mcp', 'platform/settings'] },
];

// lucide-react 1.x dropped brand icons - same mark used in the marketing
// site's icons.tsx, kept in sync for one consistent GitHub glyph across
// docs, app, and marketing site.
function GitHubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .5C5.73.5.98 5.24.98 11.52c0 5.02 3.26 9.28 7.79 10.78.57.1.78-.25.78-.55v-2.15c-3.17.69-3.84-1.36-3.84-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.33.95.1-.74.4-1.25.72-1.53-2.53-.29-5.19-1.27-5.19-5.63 0-1.24.44-2.26 1.17-3.05-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.14 1.16a10.9 10.9 0 0 1 5.72 0c2.18-1.47 3.14-1.16 3.14-1.16.62 1.58.23 2.75.11 3.04.73.79 1.17 1.81 1.17 3.05 0 4.37-2.66 5.33-5.2 5.62.41.35.77 1.04.77 2.1v3.11c0 .3.21.66.79.55 4.52-1.51 7.78-5.76 7.78-10.78C23.02 5.24 18.27.5 12 .5Z" />
    </svg>
  );
}

const ICONS: Record<string, typeof Search> = {
  'deploy/self-hosting': Server,
  'deploy/environment-variables': FileText,
  'platform/architecture': Layers,
  'deploy/migrations': GitBranch,
  'seo/page-analyzer': Search,
  'seo/site-audit': Newspaper,
  'seo/rank-tracking': TrendingUp,
  'seo/keyword-research': BarChart3,
  'seo/competitors': Users,
  'seo/backlinks': Link2,
  'seo/local-seo': MapPin,
  'seo/brand-lookup': Building2,
  'ai-visibility': Bot,
  'publish/overview': Newspaper,
  'social/overview': Share2,
  'connected-data/gsc-insights': Search,
  'connected-data/ga-insights': LineChart,
  'connected-data/bing-insights': Search,
  'connected-data/merchant-insights': ShoppingBag,
  'connected-data/integrations': Puzzle,
  'platform/cappy': MessageSquare,
  'platform/outreach': Mail,
  'platform/spend': DollarSign,
  'platform/ai-mcp': Bot,
  'platform/settings': Settings,
};

export default function HomePage() {
  const pageByPath = new Map(source.getPages().map((page) => [page.slugs.join('/'), page]));

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col items-center gap-5 border-b border-fd-border px-6 py-20 text-center">
        <span className="rounded-full border border-fd-border bg-fd-secondary px-3 py-1 text-xs font-medium text-fd-muted-foreground">
          MIT licensed · self-hosted
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">RosterSEO docs</h1>
        <p className="max-w-xl text-balance text-fd-muted-foreground">
          Open-source SEO and AI-search-visibility platform — a real crawler/auditor, keyword and SERP
          research, AI-answer-engine tracking, and Publish/Social tooling, self-hostable via Docker or
          Railway.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            href="/docs/deploy/self-hosting"
            className="inline-flex items-center gap-1.5 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started self-hosting
            <ArrowRight className="size-4" />
          </Link>
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-fd-border px-4 py-2 text-sm font-medium hover:bg-fd-accent"
          >
            <GitHubMark className="size-4" />
            Star on GitHub
          </a>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold tracking-wide text-fd-muted-foreground uppercase">{group.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.paths.map((path) => {
                const page = pageByPath.get(path);
                if (!page) return null;
                const Icon = ICONS[path] ?? Search;
                return (
                  <Link
                    key={path}
                    href={page.url}
                    className="group flex flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-fd-primary" />
                      <span className="font-medium">{page.data.title}</span>
                    </div>
                    <p className="text-sm text-fd-muted-foreground">{page.data.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
