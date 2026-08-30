import { AlignLeft, Check, Clock3, Image as ImageIcon, Link2, ListTree, TrendingUp, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CrawledPageResult } from "@rosterseo/crawler";
import type { KeywordMetrics } from "@rosterseo/dataforseo";
import type { PageSpeedMetrics } from "@rosterseo/google/pagespeed";
import type { KeywordUsageCheck } from "@/components/page-analyzer/analysis";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning" | "destructive";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "destructive" && "text-destructive")}>
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function CheckChip({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  return (
    <Badge variant={ok ? "success" : warn ? "warning" : "destructive"} className="gap-1">
      {ok ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </Badge>
  );
}

function UsageChip({ label, present }: { label: string; present: boolean }) {
  return (
    <Badge variant={present ? "success" : "destructive"} className="gap-1">
      {present ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </Badge>
  );
}

// Two-tier layout, not one flat grid: a compact checklist row for the
// binary present/missing checks (previously a full Stat card each - "Title:
// Present" doesn't deserve the same visual weight as "Core Web Vitals"),
// then a smaller numeric grid for the values that are actually numbers.
export function CrawlSummary({
  crawl,
  coreWebVitals,
  keywordMetrics,
  keywordUsage,
  targetKeyword,
}: {
  crawl: CrawledPageResult;
  coreWebVitals: PageSpeedMetrics | null;
  keywordMetrics: KeywordMetrics | null;
  keywordUsage?: KeywordUsageCheck;
  targetKeyword: string;
}) {
  const cwvNeedsWork = !!coreWebVitals && (coreWebVitals.lcp > 2.5 || coreWebVitals.cls > 0.1 || coreWebVitals.inp > 200);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Page snapshot</CardTitle>
            <CardDescription className="break-all">{crawl.url}</CardDescription>
          </div>
          {keywordMetrics ? (
            <Badge variant="seo">Vol. {keywordMetrics.searchVolume.toLocaleString()}/mo</Badge>
          ) : (
            <Badge variant="outline">Volume data not found</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Technical checks</p>
          <div className="flex flex-wrap items-center gap-2">
            <CheckChip label="Title tag" ok={!!crawl.title} />
            <CheckChip label="Meta description" ok={!!crawl.metaDescription} warn />
            <CheckChip label="Single H1" ok={crawl.h1Count === 1} warn={crawl.h1Count > 1} />
            <CheckChip label="Not noindex" ok={!crawl.noindex} />
            <CheckChip label={`HTTP ${crawl.statusCode || "failed"}`} ok={crawl.statusCode > 0 && crawl.statusCode < 400} />
          </div>
        </div>

        {keywordUsage ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Target keyword usage — where &ldquo;{targetKeyword}&rdquo; actually appears
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UsageChip label="In title" present={keywordUsage.inTitle} />
              <UsageChip label="In meta description" present={keywordUsage.inMetaDescription} />
              <UsageChip label="In H1" present={keywordUsage.inH1} />
              <UsageChip label="In URL" present={keywordUsage.inUrl} />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{keywordUsage.occurrencesInBody}</span> in body ·{" "}
                <span className="font-semibold text-foreground tabular-nums">{keywordUsage.densityPercent}%</span> density
              </span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={AlignLeft} label="Word count" value={crawl.wordCount.toLocaleString()} />
          <Stat
            icon={ImageIcon}
            label="Images missing alt text"
            value={`${crawl.imagesMissingAlt} / ${crawl.imageCount}`}
            tone={crawl.imagesMissingAlt > 0 ? "warning" : undefined}
          />
          <Stat icon={Link2} label="Internal / external links" value={`${crawl.links.length} / ${crawl.externalLinkCount}`} />
          <Stat
            icon={Clock3}
            label="Load time"
            value={`${crawl.loadTimeMs.toLocaleString()}ms`}
            tone={crawl.loadTimeMs > 2500 ? "warning" : undefined}
          />
          <Stat
            icon={TrendingUp}
            label="Core Web Vitals"
            value={coreWebVitals ? `LCP ${coreWebVitals.lcp}s` : "Unavailable"}
            hint={coreWebVitals ? `CLS ${coreWebVitals.cls} · INP ${coreWebVitals.inp}ms` : undefined}
            tone={cwvNeedsWork ? "warning" : undefined}
          />
          <Stat
            icon={ListTree}
            label="Keyword difficulty"
            value={keywordMetrics ? `${keywordMetrics.difficulty}/100` : "Data not found"}
            hint={
              keywordMetrics
                ? `CPC $${keywordMetrics.cpc.toFixed(2)}${keywordMetrics.intent ? ` · ${keywordMetrics.intent} intent` : ""}`
                : "DataForSEO unavailable for this run"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
