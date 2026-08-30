"use client";

import { useState } from "react";
import { ExternalLink, FileStack, Gauge, Link2, Loader2, Megaphone, Pencil, RadarIcon, RefreshCw, Sparkles, TrendingUp, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { createDataTableColumns, DataTable, type DataTableColumnDef } from "@/components/data-table";
import { CompetitorEditPanel } from "@/components/competitors/competitor-edit-panel";
import type { KeywordMetrics } from "@seo-tool/dataforseo";
import type { TrackedCompetitor } from "@/components/competitors/types";

type TopPage = { url: string; traffic: number };

const topPagesColumnHelper = createDataTableColumns<TopPage>();
const topPagesColumns: DataTableColumnDef<TopPage>[] = [
  topPagesColumnHelper.accessor("url", {
    header: "Page",
    cell: (info) => (
      <a
        href={info.getValue()}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-foreground hover:underline"
      >
        {info.getValue().replace(/^https?:\/\//, "")}
        <ExternalLink className="size-3 text-muted-foreground" />
      </a>
    ),
  }),
  topPagesColumnHelper.accessor("traffic", {
    header: "Est. traffic",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
  }),
];

const keywordColumnHelper = createDataTableColumns<KeywordMetrics>();
const keywordColumns: DataTableColumnDef<KeywordMetrics>[] = [
  keywordColumnHelper.accessor("keyword", { header: "Keyword idea" }),
  keywordColumnHelper.accessor("searchVolume", {
    header: "Volume",
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
  }),
  keywordColumnHelper.accessor("difficulty", {
    header: "Difficulty",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  keywordColumnHelper.accessor("cpc", {
    header: "CPC",
    cell: (info) => <span className="tabular-nums">${info.getValue().toFixed(2)}</span>,
  }),
];

// Real percent change vs the last cached fetch, formatted for MetricCard's
// deltaLabel/trend props - undefined (both) when there's no prior data
// point yet, so MetricCard renders the value with no delta row instead of
// a fabricated trend arrow (see its own doc comment).
function deltaProps(current: number, previous: number | undefined): { deltaLabel?: string; trend?: "up" | "down" } {
  if (previous === undefined || previous === 0) return {};
  const percent = ((current - previous) / previous) * 100;
  return { deltaLabel: `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}% vs last check`, trend: percent >= 0 ? "up" : "down" };
}

export function CompetitorDetail({
  competitor,
  onRemove,
  onScan,
  onSaveEdit,
  isSavingEdit,
  aiVisibilityPercent,
}: {
  competitor: TrackedCompetitor;
  onRemove: (id: string) => void;
  /** Manually triggers a real DataForSEO fetch - nothing scans on its own. */
  onScan: (id: string) => void;
  onSaveEdit: (id: string, updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) => Promise<string | null>;
  isSavingEdit: boolean;
  /** This competitor's real AI Visibility mention rate (0-100) over the
   * last 28 days - undefined means never sampled (no AI Visibility run has
   * included this domain yet), not 0%. */
  aiVisibilityPercent?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const extraIdentifiers = (competitor.aliases?.length ?? 0) + (competitor.additionalDomains?.length ?? 0);

  async function handleSave(updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) {
    const error = await onSaveEdit(competitor.id, updates);
    if (!error) setIsEditing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="text-lg font-semibold">{competitor.name || competitor.domain}</span>
            {competitor.name ? <span className="text-xs text-muted-foreground">{competitor.domain}</span> : null}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={`https://${competitor.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                  <span className="sr-only">Open {competitor.domain}</span>
                </a>
              }
            />
            <TooltipContent>Open {competitor.domain}</TooltipContent>
          </Tooltip>
          {extraIdentifiers > 0 ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {extraIdentifiers} extra identifier{extraIdentifiers === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {competitor.status === "ready" ? (
            <Button variant="outline" size="sm" onClick={() => onScan(competitor.id)} className="gap-1.5">
              <RefreshCw className="size-3.5" />
              Rescan
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setIsEditing((v) => !v)} className="gap-1.5">
            <Pencil className="size-3.5" />
            {isEditing ? "Close" : "Edit profile"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRemove(competitor.id)} className="hover:text-destructive">
            <Trash2 className="size-3.5" />
            Stop tracking
          </Button>
        </div>
      </div>

      {isEditing ? (
        <CompetitorEditPanel competitor={competitor} onSave={handleSave} onCancel={() => setIsEditing(false)} isSaving={isSavingEdit} />
      ) : null}

      {competitor.status === "idle" ? (
        <EmptyState
          icon={RadarIcon}
          title="Not scanned yet"
          description="Traffic, keywords, and backlink data load on demand - press Scan whenever you want fresh numbers for this competitor."
          action={
            <Button onClick={() => onScan(competitor.id)} className="gap-1.5">
              <RadarIcon className="size-3.5" />
              Scan {competitor.name || competitor.domain}
            </Button>
          }
        />
      ) : null}

      {aiVisibilityPercent !== undefined ? (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <Megaphone className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">AI Visibility mention rate (last 28 days)</p>
              <p className="text-lg font-semibold tabular-nums">{aiVisibilityPercent}%</p>
            </div>
            <p className="ml-auto max-w-sm text-xs text-muted-foreground">
              Share of tracked AI prompt runs that mentioned {competitor.name || competitor.domain} alongside your brand.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {competitor.status === "loading" ? <CompetitorDetailSkeleton /> : null}

      {competitor.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t scan {competitor.domain}</AlertTitle>
          <AlertDescription>
            <p>{competitor.error ?? "Something went wrong fetching this competitor's data."}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onScan(competitor.id)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {competitor.status === "ready" && competitor.snapshot ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Est. monthly traffic"
              value={competitor.snapshot.overview.estimatedMonthlyTraffic.toLocaleString()}
              icon={TrendingUp}
              {...deltaProps(competitor.snapshot.overview.estimatedMonthlyTraffic, competitor.snapshot.previous?.estimatedMonthlyTraffic)}
            />
            <MetricCard
              label="Organic keywords"
              value={competitor.snapshot.overview.organicKeywords.toLocaleString()}
              icon={Sparkles}
              {...deltaProps(competitor.snapshot.overview.organicKeywords, competitor.snapshot.previous?.organicKeywords)}
            />
            <MetricCard
              label="Referring domains"
              value={competitor.snapshot.backlinks.referringDomains.toLocaleString()}
              icon={Link2}
              {...deltaProps(competitor.snapshot.backlinks.referringDomains, competitor.snapshot.previous?.referringDomains)}
            />
            <MetricCard
              label="Domain rating"
              value={competitor.snapshot.backlinks.domainRating}
              suffix="/100"
              icon={Gauge}
              {...deltaProps(competitor.snapshot.backlinks.domainRating, competitor.snapshot.previous?.domainRating)}
            />
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Top pages</CardTitle>
              <CardDescription>Pages estimated to drive the most organic traffic for this domain</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={topPagesColumns} data={competitor.snapshot.overview.topPages} pageSize={5} bordered={false} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backlink profile</CardTitle>
              <CardDescription>Summary from the built-in backlink index</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total backlinks</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {competitor.snapshot.backlinks.totalBacklinks.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Referring domains</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {competitor.snapshot.backlinks.referringDomains.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Domain rating</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{competitor.snapshot.backlinks.domainRating}/100</p>
                </div>
              </div>
              <Alert>
                <AlertTitle>Not a full backlink audit</AlertTitle>
                <AlertDescription>
                  This backlink index is a lightweight estimate and isn&apos;t as deep as a specialized tool like
                  Ahrefs. Treat these numbers as a directional signal, not an authoritative crawl.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileStack className="size-4 text-muted-foreground" />
                Keyword gap ideas
              </CardTitle>
              <CardDescription>
                Keyword ideas seeded from {competitor.domain} — a starting point for content gaps, not a verified
                ranking overlap (no shared ranked-keyword data source yet).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={keywordColumns} data={competitor.snapshot.keywordIdeas} pageSize={8} bordered={false} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function CompetitorDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Scanning…
      </div>
    </div>
  );
}
