"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGridSkeleton, ListSkeleton } from "@/components/ui/loading-skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrawlSummary } from "@/components/page-analyzer/crawl-summary";
import { CompetitorTable } from "@/components/page-analyzer/competitor-table";
import { FixItList } from "@/components/page-analyzer/fix-it-list";
import { GuidanceCard } from "@/components/page-analyzer/guidance-card";
import { ReportExportBar } from "@/components/page-analyzer/report-export-bar";
import { PageAnalyticsSnapshot } from "@/components/page-analyzer/page-analytics-snapshot";
import { PageTypeBadge } from "@/components/page-analyzer/page-type-badge";
import { ProductSnapshot } from "@/components/page-analyzer/product-snapshot";
import type { PageAnalyzerResult } from "@/components/page-analyzer/analysis";

type ReportRow = {
  id: string;
  url: string;
  targetKeyword: string;
  status: string;
  result: PageAnalyzerResult | null;
  createdAt: string;
};

const POLL_MS = 3000;
// The analysis pipeline is in-process fire-and-forget (see the route's own
// comment) - a server restart mid-run leaves a report stuck at "running"
// forever with nothing to flip it to "failed". Past this many ms since
// creation, the honest read is "this looks stuck," not "still working" -
// several times the ~1 minute the UI itself sets as the normal expectation.
const STALE_AFTER_MS = 3 * 60 * 1000;

export function PageAnalyzerReportView({
  projectId,
  reportId,
  tab,
  gscPropertyId,
}: {
  projectId: string;
  reportId: string;
  tab: string;
  gscPropertyId?: string | null;
}) {
  const router = useRouter();

  const { data, isLoading, error } = useQuery<{ report: ReportRow }>({
    queryKey: ["page-analyzer-report", projectId, reportId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/page-analyzer/${reportId}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Report not found" : "Failed to load report");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.report?.status === "running" ? POLL_MS : false),
  });

  const running = isLoading || data?.report?.status === "running";

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <Link href="/page-analyzer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit gap-1.5 print:hidden")}>
        <ArrowLeft className="size-3.5" />
        Back to Page Analyzer
      </Link>

      {error || (!isLoading && !data?.report) ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load this report</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "This report doesn't exist or you don't have access to it."}</AlertDescription>
        </Alert>
      ) : data?.report.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>
            The analysis for {data.report.url} didn&apos;t complete. Run it again from the Page Analyzer form.
          </AlertDescription>
        </Alert>
      ) : running ? (
        <RunningState
          url={data?.report.url}
          targetKeyword={data?.report.targetKeyword}
          stale={!!data?.report.createdAt && Date.now() - new Date(data.report.createdAt).getTime() > STALE_AFTER_MS}
        />
      ) : (
        <ReportContent
          report={data!.report.result!}
          projectId={projectId}
          gscPropertyId={gscPropertyId}
          tab={tab}
          onTabChange={(v) => router.replace(`/page-analyzer?reportId=${reportId}&tab=${v}`)}
        />
      )}
    </div>
  );
}

function RunningState({ url, targetKeyword, stale }: { url?: string; targetKeyword?: string; stale: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {stale ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>This looks stuck</AlertTitle>
          <AlertDescription>
            {url ? <span className="font-medium">{url}</span> : "This page"} has been analyzing for longer than
            expected - it&apos;s still being polled in case it finishes, but a run normally completes in under a
            minute. If it doesn&apos;t resolve soon, try running the analysis again from the Page Analyzer form.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <span>
            Analyzing {url ? <span className="font-medium">{url}</span> : "this page"}
            {targetKeyword ? (
              <>
                {" "}
                for &ldquo;<span className="font-medium">{targetKeyword}</span>&rdquo;
              </>
            ) : null}
            &nbsp;- crawling the page and every real top-10 competitor, pulling real keyword and SERP data, and
            generating AI guidance. This can take up to a minute.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <StatGridSkeleton items={6} />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-56" />
        <ListSkeleton rows={5} />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}

function ReportContent({
  report,
  projectId,
  gscPropertyId,
  tab,
  onTabChange,
}: {
  report: PageAnalyzerResult;
  projectId: string;
  gscPropertyId?: string | null;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const target = report.comparisonRows.find((r) => r.isTarget);
  const inTop10 = target ? target.position !== null : false;
  const activeTab = ["overview", "onpage", "competitors", "ai"].includes(tab) ? tab : "overview";
  const highIssues = report.findings.filter((f) => f.impact === "High").length;
  const mediumIssues = report.findings.filter((f) => f.impact === "Medium").length;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <ReportExportBar report={report} projectId={projectId} gscPropertyId={gscPropertyId} />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium break-all">{report.url}</p>
            <p className="text-xs text-muted-foreground">
              Target keyword <span className="font-medium text-foreground">&ldquo;{report.targetKeyword}&rdquo;</span>
              {report.targetLocation ? ` · ${report.targetLocation}` : ""} · analyzed {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report.pageType ? <PageTypeBadge signal={report.pageType} /> : null}
            {report.keywordMetrics ? (
              <Badge variant="seo">Vol. {report.keywordMetrics.searchVolume.toLocaleString()}/mo</Badge>
            ) : (
              <Badge variant="outline">Volume data not found</Badge>
            )}
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${
            inTop10 ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"
          }`}
        >
          {inTop10 ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
          <span className="font-medium">
            {inTop10
              ? `Ranking #${target?.position} in Google's real top 10 for "${report.targetKeyword}".`
              : `Not in Google's real top 10 for "${report.targetKeyword}".`}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <div className="border-b px-3">
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="onpage">On-page & content</TabsTrigger>
              <TabsTrigger value="competitors">Competitors</TabsTrigger>
              <TabsTrigger value="ai">AI guidance</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex flex-col gap-6 p-4">
            <TabsContent value="overview" className="flex flex-col gap-6">
              {report.pageType?.type === "product" ? (
                <ProductSnapshot comparisonRows={report.comparisonRows} merchantMetrics={report.merchantMetrics} />
              ) : null}
              <PageAnalyticsSnapshot gsc={report.gscMetrics} ga4={report.ga4Metrics} />
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{report.findings.length}</span> issue{report.findings.length === 1 ? "" : "s"} found
                </span>
                {highIssues > 0 ? <Badge variant="destructive">{highIssues} high</Badge> : null}
                {mediumIssues > 0 ? <Badge variant="warning">{mediumIssues} medium</Badge> : null}
              </div>
              <FixItList findings={report.findings} />
            </TabsContent>
            <TabsContent value="onpage">
              <CrawlSummary
                crawl={report.crawl}
                coreWebVitals={report.coreWebVitals}
                keywordMetrics={report.keywordMetrics}
                keywordUsage={report.keywordUsage}
                targetKeyword={report.targetKeyword}
              />
            </TabsContent>
            <TabsContent value="competitors">
              <CompetitorTable rows={report.comparisonRows} targetKeyword={report.targetKeyword} />
            </TabsContent>
            <TabsContent value="ai">
              <GuidanceCard
                projectId={projectId}
                aiSuggestions={report.aiSuggestions}
                aiUnavailableReason={report.aiUnavailableReason}
                legacyRankingGuidance={report.rankingGuidance}
                legacyAiVisibilityGuidance={report.aiVisibilityGuidance}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
