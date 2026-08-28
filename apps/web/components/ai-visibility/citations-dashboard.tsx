"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CitationStackedAreaChart } from "@/components/ai-visibility/citation-stacked-area-chart";
import { AiVisibilityFilterBar } from "@/components/ai-visibility/ai-visibility-filter-bar";
import { cn } from "@/lib/utils";
import {
  buildCategorySeries,
  buildContentGaps,
  buildPageTypeSeries,
  buildRecentChanges,
  buildRedditRollup,
  rollUpCitationDomains,
  rollUpCitationUrls,
  tallyCitations,
  CATEGORY_CONFIG,
  PAGE_TYPE_LABELS,
  type CitationCategory,
  type CitationPageType,
  type CitationRow,
  type DomainStat,
  type UrlStat,
} from "@seo-tool/ai-visibility";

type PromptTags = { id: string; tags: string[] };
type ModelOption = { value: string; label: string };

const PAGE_TYPE_CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function categoryChartColor(key: string): string {
  return (CATEGORY_CONFIG as Record<string, { chartColorVar?: string }>)[key]?.chartColorVar ?? "var(--muted-foreground)";
}

function CategoryBadge({ category }: { category: CitationCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <Badge variant="outline" className={cn("text-xs", cfg.badgeClass)}>
      {cfg.label}
    </Badge>
  );
}

function Pager({ page, setPage, total, pageSize }: { page: number; setPage: (p: number) => void; total: number; pageSize: number }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  if (total <= pageSize) return null;
  const start = safePage * pageSize + 1;
  const end = Math.min(total, start + pageSize - 1);
  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
      <span>
        {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          size="icon-xs"
          disabled={safePage === 0}
          onClick={() => setPage(safePage - 1)}
        />
        <IconButton
          icon={ChevronRight}
          label="Next page"
          size="icon-xs"
          disabled={safePage >= totalPages - 1}
          onClick={() => setPage(safePage + 1)}
        />
      </div>
    </div>
  );
}

function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; safePage: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  return { pageItems: items.slice(safePage * pageSize, safePage * pageSize + pageSize), safePage };
}

const competitorsFetcher = (url: string) => fetch(url).then((res) => res.json());

// "Track domain" quick-add - lets an "Other"-bucketed domain in Top Cited
// Domains be claimed as the brand's own (Settings > Brand's
// aiVisibilityAdditionalDomains) or folded into a tracked competitor
// (projectCompetitors.additionalDomains), without leaving the page. classifyUrl
// runs fresh against real aiVisibilityResults rows on every page load
// (nothing is cached/materialized - see citation-classification.ts's file
// header), so this reclassifies every real citation immediately on refresh,
// not just future ones.
function TrackDomainMenu({
  domain,
  projectId,
  onTracked,
}: {
  domain: string;
  projectId: string;
  onTracked: () => void;
}) {
  const { data } = useSWR<{ competitors: Array<{ id: string; domain: string; name: string | null }> }>(
    `/api/projects/${projectId}/competitors`,
    competitorsFetcher,
  );
  const competitors = data?.competitors ?? [];
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<Response>) {
    setBusy(true);
    try {
      const res = await request();
      if (res.ok) onTracked();
    } finally {
      setBusy(false);
    }
  }

  const markAsBrand = () =>
    run(() =>
      fetch(`/api/projects/${projectId}/ai-visibility/brand`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addDomain: domain }),
      }),
    );

  const addToCompetitor = (competitorId: string) =>
    run(() =>
      fetch(`/api/projects/${projectId}/competitors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: competitorId, addDomain: domain }),
      }),
    );

  const trackAsNewCompetitor = () =>
    run(() =>
      fetch(`/api/projects/${projectId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, name: domain }),
      }),
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            icon={busy ? Loader2 : Tag}
            label={`Track ${domain}`}
            size="icon-xs"
            disabled={busy}
            className={busy ? "[&_svg]:animate-spin" : undefined}
          />
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Track {domain} as...</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={markAsBrand}>This is our domain</DropdownMenuItem>
        {competitors.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Add to a tracked competitor</DropdownMenuLabel>
            {competitors.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => addToCompetitor(c.id)}>
                {c.name || c.domain}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={trackAsNewCompetitor}>Track as a new competitor</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CitationsDashboard({
  projectId,
  rows,
  prompts,
  allTags,
  allModels,
  brandDomain,
  initialDays,
}: {
  // Both optional: prompt-detail.tsx also renders this dashboard, scoped to
  // one prompt's already-small `rows` set with no server-side day-window
  // fetch or "Track domain" action behind it (no real projectId route to
  // navigate/PATCH against there) - omitting them falls back to the
  // pre-existing client-only-filtering behavior for that embedded view.
  projectId?: string;
  rows: CitationRow[];
  prompts: PromptTags[];
  allTags: string[];
  allModels: ModelOption[];
  brandDomain: string;
  // The `days` window the server already filtered `rows` to (see
  // citations/page.tsx) - seeds local state so the Select reflects the real
  // fetched window instead of a hardcoded default.
  initialDays?: number;
}) {
  const router = useRouter();
  const [days, setDays] = useState<number>(initialDays ?? 30);
  const [model, setModel] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const [domainSearch, setDomainSearch] = useState("");
  const [domainCategory, setDomainCategory] = useState<CitationCategory | "all">("all");
  const [domainPage, setDomainPage] = useState(0);

  const [urlSearch, setUrlSearch] = useState("");
  const [urlCategory, setUrlCategory] = useState<CitationCategory | "all">("all");
  const [urlPageType, setUrlPageType] = useState<CitationPageType | "all">("all");
  const [urlPage, setUrlPage] = useState(0);

  const [changeTab, setChangeTab] = useState<"newPages" | "droppedPages" | "titleChanges" | "newDomains" | "droppedDomains">("newPages");
  const [gapPage, setGapPage] = useState(0);
  const [redditPage, setRedditPage] = useState(0);
  const [expandedSubreddit, setExpandedSubreddit] = useState<string | null>(null);

  const allowedPromptIds = useMemo(() => {
    if (selectedTags.size === 0) return null;
    return new Set(prompts.filter((p) => p.tags.some((t) => selectedTags.has(t))).map((p) => p.id));
  }, [prompts, selectedTags]);

  function matches(r: CitationRow, start: string, end: string): boolean {
    return r.date >= start && r.date <= end && (model === "all" || r.model === model) && (allowedPromptIds === null || allowedPromptIds.has(r.promptId));
  }

  // days === 0 is the "all time" sentinel (AI_VISIBILITY_DAY_OPTIONS) - no
  // lower bound for the current window, and no honest "previous period" to
  // compare against (there's nothing before "all time"), so the previous
  // window is left empty (start > end matches nothing) rather than faking
  // one - recentChanges/domain deltas correctly show no prior data instead
  // of a made-up comparison.
  const currentStart = days === 0 ? "0000-00-00" : isoDaysAgo(days - 1);
  const currentEnd = isoDaysAgo(0);
  const previousEnd = days === 0 ? "0000-00-00" : isoDaysAgo(days);
  const previousStart = days === 0 ? "9999-99-99" : isoDaysAgo(2 * days - 1);

  const currentRows = useMemo(() => rows.filter((r) => matches(r, currentStart, currentEnd)), [rows, currentStart, currentEnd, model, allowedPromptIds]);
  const previousRows = useMemo(() => rows.filter((r) => matches(r, previousStart, previousEnd)), [rows, previousStart, previousEnd, model, allowedPromptIds]);

  const urlStatsCurrent = useMemo(() => rollUpCitationUrls(currentRows), [currentRows]);
  const urlStatsPrevious = useMemo(() => rollUpCitationUrls(previousRows), [previousRows]);
  const domainStatsCurrentRaw = useMemo(() => rollUpCitationDomains(urlStatsCurrent), [urlStatsCurrent]);
  const domainStatsPrevious = useMemo(() => rollUpCitationDomains(urlStatsPrevious), [urlStatsPrevious]);

  const domainStatsCurrent: DomainStat[] = useMemo(() => {
    const prevMap = new Map(domainStatsPrevious.map((d) => [d.domain, d.count]));
    return domainStatsCurrentRaw.map((d) => {
      const previousCount = prevMap.get(d.domain) ?? 0;
      return { ...d, previousCount, changePercent: previousCount > 0 ? Math.round(((d.count - previousCount) / previousCount) * 100) : null };
    });
  }, [domainStatsCurrentRaw, domainStatsPrevious]);

  const tally = useMemo(() => tallyCitations(urlStatsCurrent), [urlStatsCurrent]);
  // buildCategorySeries/buildPageTypeSeries need a real day *count*, not
  // the days===0 "all time" sentinel - for "all time" the chart should
  // span from the earliest real row to today, so derive that count here
  // rather than teaching the shared chart-series helpers a second meaning
  // for `days`.
  const chartDays = useMemo(() => {
    if (days !== 0) return days;
    if (currentRows.length === 0) return 1;
    const earliest = currentRows.reduce((min, r) => (r.date < min ? r.date : min), currentRows[0]!.date);
    const spanMs = Date.now() - new Date(`${earliest}T00:00:00Z`).getTime();
    return Math.max(1, Math.ceil(spanMs / 86_400_000) + 1);
  }, [currentRows, days]);

  const categorySeries = useMemo(() => buildCategorySeries(currentRows, chartDays), [currentRows, chartDays]);
  const pageTypeSeries = useMemo(() => buildPageTypeSeries(currentRows, chartDays), [currentRows, chartDays]);
  const recentChanges = useMemo(() => buildRecentChanges(urlStatsCurrent, urlStatsPrevious), [urlStatsCurrent, urlStatsPrevious]);
  const contentGaps = useMemo(() => buildContentGaps(currentRows), [currentRows]);

  const prevUrlSet = useMemo(() => new Set(urlStatsPrevious.map((u) => u.normalizedUrl)), [urlStatsPrevious]);
  const redditStats = useMemo(() => buildRedditRollup(urlStatsCurrent, prevUrlSet), [urlStatsCurrent, prevUrlSet]);

  const brandSharePercent = useMemo(() => {
    const last = categorySeries.data.at(-1) as Record<string, number> | undefined;
    if (last && typeof last.brand === "number") return last.brand;
    return tally.totalCitations > 0 ? Math.round(((tally.categoryCounts.brand ?? 0) / tally.totalCitations) * 100) : 0;
  }, [categorySeries, tally]);

  const presentCategories = useMemo(() => {
    const set = new Set(domainStatsCurrent.map((d) => d.category));
    return (Object.keys(CATEGORY_CONFIG) as CitationCategory[]).filter((c) => set.has(c));
  }, [domainStatsCurrent]);

  const presentUrlCategories = useMemo(() => {
    const set = new Set(urlStatsCurrent.map((u) => u.category));
    return (Object.keys(CATEGORY_CONFIG) as CitationCategory[]).filter((c) => set.has(c));
  }, [urlStatsCurrent]);

  const presentPageTypes = useMemo(() => {
    const set = new Set(urlStatsCurrent.map((u) => u.pageType));
    return (Object.keys(PAGE_TYPE_LABELS) as CitationPageType[]).filter((p) => set.has(p));
  }, [urlStatsCurrent]);

  const filteredDomains = useMemo(() => {
    const q = domainSearch.trim().toLowerCase();
    return domainStatsCurrent.filter((d) => (domainCategory === "all" || d.category === domainCategory) && (!q || d.domain.toLowerCase().includes(q)));
  }, [domainStatsCurrent, domainCategory, domainSearch]);
  const maxDomainCount = filteredDomains[0]?.count ?? 1;
  const { pageItems: domainPageItems, safePage: domainSafePage } = paginate(filteredDomains, domainPage, 10);

  const filteredUrls = useMemo(() => {
    const q = urlSearch.trim().toLowerCase();
    return urlStatsCurrent.filter(
      (u) =>
        (urlCategory === "all" || u.category === urlCategory) &&
        (urlPageType === "all" || u.pageType === urlPageType) &&
        (!q || u.url.toLowerCase().includes(q) || (u.title ?? "").toLowerCase().includes(q) || u.domain.toLowerCase().includes(q)),
    );
  }, [urlStatsCurrent, urlCategory, urlPageType, urlSearch]);
  const { pageItems: urlPageItems, safePage: urlSafePage } = paginate(filteredUrls, urlPage, 20);

  const { pageItems: gapPageItems, safePage: gapSafePage } = paginate(contentGaps, gapPage, 6);
  const { pageItems: redditPageItems, safePage: redditSafePage } = paginate(redditStats, redditPage, 8);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // The day window is now server-filtered (citations/page.tsx fetches only
  // ~2x the selected window), so changing it needs a real navigation - not
  // just local state - to re-run the server query with the new cutoff.
  // router.replace keeps it a soft navigation (no full page reload); local
  // state updates immediately so the Select feels instant while the new
  // `rows` prop lands moments later.
  function handleDaysChange(next: number) {
    setDays(next);
    // No projectId (prompt-detail.tsx's embedded citations tab) means no
    // real /ai-visibility/citations route backs this instance - stay
    // client-only rather than navigating the whole prompt detail page away.
    if (projectId) router.replace(`/ai-visibility/citations?days=${next}`);
  }

  function refetchAfterTrack() {
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="No citations yet"
        description="Run a visibility check to start collecting real cited sources - richest with Perplexity, BrightData, or OpenRouter's :online mode configured, since those are the providers whose responses actually carry source URLs."
      />
    );
  }

  const CHANGE_TABS = [
    { key: "newPages" as const, label: "New Pages" },
    { key: "droppedPages" as const, label: "Dropped Pages" },
    { key: "titleChanges" as const, label: "Title Changes" },
    { key: "newDomains" as const, label: "New Domains" },
    { key: "droppedDomains" as const, label: "Dropped Domains" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AiVisibilityFilterBar
        model={model}
        onModelChange={setModel}
        modelOptions={allModels}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        allTags={allTags}
        days={days}
        onDaysChange={handleDaysChange}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Brand Citation Share" value={`${brandSharePercent}%`} icon={Link2} deltaLabel={`vs ${brandDomain}`} />
        <MetricCard label="Unique Domains" value={domainStatsCurrent.length.toLocaleString()} icon={Link2} deltaLabel="distinct cited domains" />
        <MetricCard label="Total Citations" value={tally.totalCitations.toLocaleString()} icon={Link2} deltaLabel="real citations in window" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Citation Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <CitationStackedAreaChart
              data={categorySeries.data}
              keys={categorySeries.keys}
              labels={Object.fromEntries(categorySeries.keys.map((k) => [k, CATEGORY_CONFIG[k as CitationCategory]?.label ?? k]))}
              colors={Object.fromEntries(categorySeries.keys.map((k) => [k, categoryChartColor(k)]))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Citation Page Types</CardTitle>
          </CardHeader>
          <CardContent>
            <CitationStackedAreaChart
              data={pageTypeSeries.data}
              keys={pageTypeSeries.keys}
              labels={Object.fromEntries(pageTypeSeries.keys.map((k) => [k, PAGE_TYPE_LABELS[k as CitationPageType] ?? k]))}
              colors={Object.fromEntries(pageTypeSeries.keys.map((k, i) => [k, k === "other" ? "var(--muted-foreground)" : (PAGE_TYPE_CHART_COLORS[i] ?? "var(--muted-foreground)")]))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Changes</CardTitle>
            <CardDescription>How AI citations have shifted {days === 0 ? "over all time" : `over the past ${days} days`}.</CardDescription>
          </CardHeader>
          <UnderlineTabs tabs={CHANGE_TABS} active={changeTab} onSelect={setChangeTab} />
          <CardContent className="flex flex-col gap-1 pt-4">
            {changeTab === "newPages" &&
              (recentChanges.newPages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No new pages in this window.</p>
              ) : (
                recentChanges.newPages.map((p) => (
                  <div key={p.url} className="flex items-start gap-2 py-1.5">
                    <Plus className="mt-0.5 size-4 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <a href={p.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-medium hover:underline">
                        {p.title || p.domain}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        0 → {p.count} citations across {p.promptCount} prompt{p.promptCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ))
              ))}
            {changeTab === "droppedPages" &&
              (recentChanges.droppedPages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No dropped pages in this window.</p>
              ) : (
                recentChanges.droppedPages.map((p) => (
                  <div key={p.url} className="flex items-start gap-2 py-1.5">
                    <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <a href={p.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-medium hover:underline">
                        {p.title || p.domain}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {p.previousCount} → {p.count} citations across {p.promptCount} prompt{p.promptCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ))
              ))}
            {changeTab === "titleChanges" &&
              (recentChanges.titleChanges.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No title changes in this window.</p>
              ) : (
                recentChanges.titleChanges.map((t) => (
                  <div key={t.url} className="flex items-start gap-2 py-1.5">
                    <RefreshCw className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <a href={t.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm font-medium hover:underline">
                        {t.currentTitle}
                      </a>
                      <p className="truncate text-xs text-muted-foreground">was: {t.previousTitle}</p>
                    </div>
                  </div>
                ))
              ))}
            {changeTab === "newDomains" &&
              (recentChanges.newDomains.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No new domains in this window.</p>
              ) : (
                recentChanges.newDomains.map((d) => (
                  <div key={d.domain} className="flex items-center gap-2 py-1.5">
                    <Plus className="size-4 shrink-0 text-success" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.domain}</span>
                    <CategoryBadge category={d.category} />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{d.count}x</span>
                  </div>
                ))
              ))}
            {changeTab === "droppedDomains" &&
              (recentChanges.droppedDomains.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No dropped domains in this window.</p>
              ) : (
                recentChanges.droppedDomains.map((d) => (
                  <div key={d.domain} className="flex items-center gap-2 py-1.5">
                    <Minus className="size-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.domain}</span>
                    <CategoryBadge category={d.category} />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">was {d.previousCount}x</span>
                  </div>
                ))
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content Gaps</CardTitle>
            <CardDescription>Prompts where competitors are cited but your brand isn&apos;t.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {contentGaps.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No content gaps in this window - nice.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1 px-4 pt-2">
                  {gapPageItems.map((g) => (
                    <div key={g.promptId} className="flex items-start gap-2 py-1.5">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{g.promptText}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.uniqueCompetitors} competitor{g.uniqueCompetitors === 1 ? "" : "s"} cited {g.competitorCitationCount} time
                          {g.competitorCitationCount === 1 ? "" : "s"} — your brand cited 0 times
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Pager page={gapSafePage} setPage={setGapPage} total={contentGaps.length} pageSize={6} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Top Cited Domains</CardTitle>
            <CardDescription>
              Which domains LLMs reference most when responding to your prompts.
              {projectId
                ? ` Recognize an "Other" domain as yours or a competitor's? Use the tag icon to track it - citations reclassify immediately on refresh, no backfill needed.`
                : ""}
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search domains..."
              value={domainSearch}
              onChange={(e) => {
                setDomainSearch(e.target.value);
                setDomainPage(0);
              }}
              className="pl-8"
            />
          </div>
        </CardHeader>
        {presentCategories.length > 1 ? (
          <UnderlineTabs
            tabs={[{ key: "all" as const, label: "All Sources" }, ...presentCategories.map((c) => ({ key: c, label: CATEGORY_CONFIG[c].label }))]}
            active={domainCategory}
            onSelect={(k) => {
              setDomainCategory(k);
              setDomainPage(0);
            }}
          />
        ) : null}
        <CardContent className="p-0">
          {filteredDomains.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matching domains.</p>
          ) : (
            <div className="flex flex-col gap-2 px-4 pt-3">
              {domainPageItems.map((d) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <span className="flex w-40 shrink-0 items-center gap-1 sm:w-56">
                    <span className="truncate text-sm font-medium">{d.domain}</span>
                    {d.category === "other" && projectId ? (
                      <TrackDomainMenu domain={d.domain} projectId={projectId} onTracked={refetchAfterTrack} />
                    ) : null}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(d.count / maxDomainCount) * 100}%`, backgroundColor: categoryChartColor(d.category) }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{d.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <Pager page={domainSafePage} setPage={setDomainPage} total={filteredDomains.length} pageSize={10} />
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Top Cited URLs</CardTitle>
            <CardDescription>
              Individual pages cited by LLMs — {brandDomain} accounts for {brandSharePercent}% of all citations.
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search URLs..."
              value={urlSearch}
              onChange={(e) => {
                setUrlSearch(e.target.value);
                setUrlPage(0);
              }}
              className="pl-8"
            />
          </div>
        </CardHeader>
        {presentUrlCategories.length > 1 ? (
          <UnderlineTabs
            tabs={[{ key: "all" as const, label: "All Sources" }, ...presentUrlCategories.map((c) => ({ key: c, label: CATEGORY_CONFIG[c].label }))]}
            active={urlCategory}
            onSelect={(k) => {
              setUrlCategory(k);
              setUrlPage(0);
            }}
          />
        ) : null}
        {presentPageTypes.length > 1 ? (
          <div className="border-b px-4 py-2">
            <UnderlineTabs
              tabs={[{ key: "all" as const, label: "All Page Types" }, ...presentPageTypes.map((p) => ({ key: p, label: PAGE_TYPE_LABELS[p] }))]}
              active={urlPageType}
              onSelect={(k) => {
                setUrlPageType(k);
                setUrlPage(0);
              }}
            />
          </div>
        ) : null}
        <CardContent className="p-0">
          {filteredUrls.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matching URLs.</p>
          ) : (
            urlPageItems.map((u) => (
              <a
                key={u.normalizedUrl}
                href={u.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-0 hover:bg-muted/40"
              >
                <CategoryBadge category={u.category} />
                {!prevUrlSet.has(u.normalizedUrl) ? (
                  <Badge variant="success" className="text-xs">
                    NEW
                  </Badge>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.title || u.url}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.domain}</p>
                </div>
                {u.avgPosition !== null ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Average citation position">avg {u.avgPosition.toFixed(1)}</span> : null}
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{u.count}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </a>
            ))
          )}
        </CardContent>
        <Pager page={urlSafePage} setPage={setUrlPage} total={filteredUrls.length} pageSize={20} />
      </Card>

      {redditStats.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Reddit</CardTitle>
            <CardDescription>Top cited subreddits — which Reddit communities AI models reference when answering your prompts.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {redditPageItems.map((s) => (
              <div key={s.subreddit} className="border-b last:border-0">
                <button
                  type="button"
                  onClick={() => setExpandedSubreddit((prev) => (prev === s.subreddit ? null : s.subreddit))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 font-medium">
                    {s.subreddit}
                    {s.newCount > 0 ? (
                      <Badge variant="success" className="text-xs">
                        +{s.newCount} new
                      </Badge>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </button>
                {expandedSubreddit === s.subreddit ? (
                  <div className="border-t bg-muted/20 px-4 py-2 pl-10">
                    {s.threads.map((t) => (
                      <a
                        key={t.url}
                        href={t.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between gap-2 py-1.5 text-sm hover:underline"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {t.isNew ? <Badge variant="success" className="text-[10px]">NEW</Badge> : null}
                          <span className="truncate">{t.title || t.url}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{t.count}x</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
          <Pager page={redditSafePage} setPage={setRedditPage} total={redditStats.length} pageSize={8} />
        </Card>
      ) : null}
    </div>
  );
}
