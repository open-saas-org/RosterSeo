"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, ExternalLink, Loader2, Pencil, RadarIcon, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CompetitorEditPanel } from "@/components/competitors/competitor-edit-panel";
import { cn } from "@/lib/utils";
import type { TrackedCompetitor } from "@/components/competitors/types";

// Real percent change vs the last cached fetch - null (not 0%) when there's
// no prior data point to compare against yet, so a brand-new competitor
// never shows a fabricated trend.
function percentDelta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function Stat({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{value}</span>
        {delta !== null ? (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", delta >= 0 ? "text-success" : "text-destructive")}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

// The compact, always-visible card every tracked competitor gets, stacked
// one below another on the Competitors page - a slim row of real stats
// (with a real vs-last-check delta, not a decorative caption) plus quick
// Edit/Stop tracking actions, no click required. The deeper stuff (top
// pages, backlink profile, keyword gap ideas, AI Visibility mention rate)
// lives one level down on this competitor's own /competitors/[id] detail
// page - see CompetitorDetail.
export function CompetitorSummaryCard({
  competitor,
  onRemove,
  onScan,
  onSaveEdit,
  isSavingEdit,
}: {
  competitor: TrackedCompetitor;
  onRemove: (id: string) => void;
  /** Manually triggers a real DataForSEO fetch for this one competitor -
   * nothing here ever scans on its own (page load, add, or otherwise). */
  onScan: (id: string) => void;
  onSaveEdit: (id: string, updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) => Promise<string | null>;
  isSavingEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const extraIdentifiers = (competitor.aliases?.length ?? 0) + (competitor.additionalDomains?.length ?? 0);
  const detailHref = `/competitors/${competitor.id}`;
  const snapshot = competitor.snapshot;
  const previous = snapshot?.previous;

  async function handleSave(updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) {
    const error = await onSaveEdit(competitor.id, updates);
    if (!error) setIsEditing(false);
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link href={detailHref} className="truncate font-semibold hover:underline">
              {competitor.name || competitor.domain}
            </Link>
            {competitor.name ? <span className="shrink-0 truncate text-xs text-muted-foreground">{competitor.domain}</span> : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <a href={`https://${competitor.domain}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-3.5" />
                    <span className="sr-only">Open {competitor.domain}</span>
                  </a>
                }
              />
              <TooltipContent>Open {competitor.domain}</TooltipContent>
            </Tooltip>
            {extraIdentifiers > 0 ? (
              <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                {extraIdentifiers} extra identifier{extraIdentifiers === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {competitor.status === "ready" ? (
              <IconButton icon={RefreshCw} label="Rescan" onClick={() => onScan(competitor.id)} />
            ) : null}
            <IconButton icon={Pencil} label={isEditing ? "Close editor" : "Edit profile"} onClick={() => setIsEditing((v) => !v)} />
            <IconButton icon={Trash2} label="Stop tracking" onClick={() => onRemove(competitor.id)} className="hover:text-destructive" />
            <IconButton icon={ChevronRight} label="View full details" render={<Link href={detailHref} />} />
          </div>
        </div>

        {isEditing ? (
          <CompetitorEditPanel competitor={competitor} onSave={handleSave} onCancel={() => setIsEditing(false)} isSaving={isSavingEdit} />
        ) : null}

        {competitor.status === "idle" ? (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">Not scanned yet - traffic, keywords, and backlinks load on demand.</p>
            <Button size="sm" variant="outline" onClick={() => onScan(competitor.id)} className="gap-1.5">
              <RadarIcon className="size-3.5" />
              Scan
            </Button>
          </div>
        ) : null}

        {competitor.status === "loading" ? (
          <div className="flex flex-col gap-4 border-t pt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Scanning {competitor.domain}…
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          </div>
        ) : null}

        {competitor.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle className="flex items-center gap-1.5">
              <TriangleAlert className="size-4" />
              Couldn't scan {competitor.domain}
            </AlertTitle>
            <AlertDescription>
              <p>{competitor.error ?? "Something went wrong fetching this competitor's data."}</p>
              <button type="button" onClick={() => onScan(competitor.id)} className="mt-1 text-xs font-medium underline">
                Retry
              </button>
            </AlertDescription>
          </Alert>
        ) : null}

        {competitor.status === "ready" && snapshot ? (
          <div className="grid grid-cols-2 gap-4 border-t pt-3 sm:grid-cols-4">
            <Stat
              label="Est. traffic"
              value={snapshot.overview.estimatedMonthlyTraffic.toLocaleString()}
              delta={percentDelta(snapshot.overview.estimatedMonthlyTraffic, previous?.estimatedMonthlyTraffic)}
            />
            <Stat
              label="Organic keywords"
              value={snapshot.overview.organicKeywords.toLocaleString()}
              delta={percentDelta(snapshot.overview.organicKeywords, previous?.organicKeywords)}
            />
            <Stat
              label="Referring domains"
              value={snapshot.backlinks.referringDomains.toLocaleString()}
              delta={percentDelta(snapshot.backlinks.referringDomains, previous?.referringDomains)}
            />
            <Stat
              label="Domain rating"
              value={`${snapshot.backlinks.domainRating}/100`}
              delta={percentDelta(snapshot.backlinks.domainRating, previous?.domainRating)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
