"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileText,
  Link2,
  Loader2,
  OctagonAlert,
  ShieldCheck,
  CheckCircle2,
  Download,
  Zap,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressTrack, ProgressIndicator, ProgressValue } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/data-table";
import { ListSkeleton, StatGridSkeleton } from "@/components/ui/loading-skeletons";
import { FilterSelect } from "@/components/ui/filter-select";
import { siteAuditIssueColumns, type SiteAuditIssueRow } from "@/components/site-audit/site-audit-columns";
import type { IssueSeverity } from "@/components/site-audit/audit-engine";
import { IndexNowSubmitAction } from "@/components/site-audit/indexnow-submit-action";
import { SiteAuditPagesTable } from "@/components/site-audit/site-audit-pages-table";
import { SiteAuditLaunchControl } from "@/components/site-audit/site-audit-launch-control";

// --- Types ---
type AuditPage = {
  id: string;
  url: string;
  statusCode: number;
  title: string | null;
  h1Count: number;
  wordCount: number;
  imageCount: number;
  loadTimeMs: number;
  crawlDepth: number;
  canonicalUrl: string | null;
  metaRobots: string | null;
  redirectedTo: string | null;
  action: string;
  notes: string | null;
  h2Texts: string[] | null;
};

type AuditIssue = {
  id: string;
  severity: IssueSeverity;
  category: string;
  url: string;
  description: string;
};

type AuditDetail = {
  id: string;
  projectId: string;
  status: string;
  pagesCrawled: number;
  healthScore: number;
  startedAt: string;
  completedAt: string;
  siteAuditIssues: AuditIssue[];
  siteAuditPages: AuditPage[];
};

// --- Utilities ---
function toPath(url: string, domain: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const withoutDomain = withoutScheme.startsWith(domain) ? withoutScheme.slice(domain.length) : withoutScheme;
  return withoutDomain === "" ? "/" : withoutDomain;
}

// Broken links / orphaned pages / keyword cannibalization run as their own
// separate, on-demand "Deep Check" pass (see the /site-audit/[auditId]/
// deep-check page) - if one has been run for this audit, its issue rows
// share this same auditId/site_audit_issues table, but they're deliberately
// excluded from this main Issues tab so this crawl's own results and the
// deep check's results never mix in one view.
const DEEP_CHECK_CATEGORIES = new Set(["Broken Links", "Orphaned Pages", "Keyword Cannibalization"]);

const SEVERITY_FILTERS: { value: "all" | IssueSeverity; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

export function SiteAuditDetail({
  project,
  auditId,
  tab,
}: {
  project: { id: string; name: string; domain: string };
  auditId: string;
  tab: string;
}) {
  const router = useRouter();
  const [severityFilter, setSeverityFilter] = useState<"all" | IssueSeverity>("all");
  const [pageSearch, setPageSearch] = useState("");
  const [showNewAudit, setShowNewAudit] = useState(false);

  // Use React Query with a polling interval while running
  const { data: progressData, isLoading: isProgressLoading, error: progressError } = useQuery({
    queryKey: ["site-audit-progress", project.id, auditId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/site-audit/${auditId}/progress`);
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.audit?.status;
      return status === "pending" || status === "running" || status === "analyzing" ? 1500 : false;
    },
  });

  const { data: auditRun, isLoading: isFullLoading, error } = useQuery<AuditDetail>({
    queryKey: ["site-audit-detail", project.id, auditId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/site-audit/${auditId}`);
      if (!res.ok) throw new Error("Failed to fetch audit detail");
      return res.json();
    },
    enabled: !!progressData && (progressData.audit.status === "complete" || progressData.audit.status === "failed"),
  });

  const status = progressData?.audit?.status || "pending";
  const pagesCrawled = progressData?.audit?.pagesCrawled || 0;
  const pagesDiscovered = progressData?.audit?.pagesDiscovered || 0;
  const recentPages = progressData?.recentPages || [];

  const [isCancelling, setIsCancelling] = useState(false);
  async function handleCancel() {
    if (!confirm("Cancel this audit? Pages already crawled will still be billed and kept.")) return;
    setIsCancelling(true);
    const res = await fetch(`/api/projects/${project.id}/site-audit/${auditId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/site-audit");
    } else {
      setIsCancelling(false);
    }
  }

  // This crawl's own issues only - a completed Deep Check pass's rows
  // (Broken Links / Orphaned Pages / Keyword Cannibalization) live on their
  // own page, not mixed into this tab.
  const coreIssues = useMemo(() => {
    if (!auditRun) return [];
    return auditRun.siteAuditIssues.filter((issue) => !DEEP_CHECK_CATEGORIES.has(issue.category));
  }, [auditRun]);

  const issueRows = useMemo<SiteAuditIssueRow[]>(() => {
    return coreIssues
      .filter((issue) => severityFilter === "all" || issue.severity === severityFilter)
      .map((issue) => ({ ...issue, path: toPath(issue.url, project.domain) }));
  }, [coreIssues, severityFilter, project.domain]);

  const counts = useMemo(() => {
    return {
      critical: coreIssues.filter((i) => i.severity === "critical").length,
      warning: coreIssues.filter((i) => i.severity === "warning").length,
      info: coreIssues.filter((i) => i.severity === "info").length,
    };
  }, [coreIssues]);

  const avgResponseTime = useMemo(() => {
    if (!auditRun || auditRun.siteAuditPages.length === 0) return 0;
    const totalMs = auditRun.siteAuditPages.reduce((acc, p) => acc + p.loadTimeMs, 0);
    return Math.round(totalMs / auditRun.siteAuditPages.length);
  }, [auditRun]);

  // Exports whichever tab is currently active as CSV, built from data
  // already loaded client-side (no extra fetch needed). The button used to
  // have no handler at all.
  function toCsvCell(value: unknown): string {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function downloadCsv(filename: string, rows: (string | number)[][]) {
    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    if (!auditRun) return;
    downloadCsv(`site-audit-${auditId}-issues.csv`, [
      ["Severity", "Category", "URL", "Description"],
      ...issueRows.map((i) => [i.severity, i.category, i.url, i.description]),
    ]);
  }

  if (error || progressError) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border p-8 text-center text-destructive">Failed to load audit data.</div>
      </div>
    );
  }

  // Real status not fetched yet - was defaulting to "pending" above, which
  // showed a real "Crawling pages" flash on every page load/refresh even
  // for an audit that finished days ago, until the first /progress fetch
  // resolved. Show a real loading skeleton instead until we actually know.
  if (isProgressLoading) {
    return (
      <div className="flex flex-col gap-4">
        <StatGridSkeleton items={4} />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (status === "pending" || status === "running" || status === "analyzing") {
    const isAnalyzing = status === "analyzing";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 border-b pb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.domain}</h1>
            <Badge variant="secondary" className="animate-pulse">{isAnalyzing ? "Analyzing" : "Running"}</Badge>
          </div>
        </div>

        <Card className="max-w-3xl mx-auto w-full mt-12 bg-card/50 shadow-none border-border/50">
          <CardContent className="p-6 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 text-primary animate-spin" />
                <span className="font-semibold text-lg">{isAnalyzing ? "Analyzing performance" : "Crawling pages"}</span>
              </div>
              {!isAnalyzing ? (
                <Badge variant="secondary" className="bg-muted">
                  {pagesDiscovered} discovered
                </Badge>
              ) : null}
            </div>

            {isAnalyzing ? (
              <p className="text-sm text-muted-foreground">
                Crawl complete - {pagesCrawled} pages crawled. Running Core Web Vitals checks on a sample of pages
                before finishing up.
              </p>
            ) : (
              // Percent of what's been *discovered so far*, not a fixed
              // maxPages ceiling - there isn't a real target page count
              // known up front (a full BFS crawl has no limit, see
              // site-audit-launch-control.tsx), so "discovered" is the
              // only real, live denominator. It keeps growing as the crawl
              // finds more links, so this only reaches 100% right at real
              // completion, not partway through - expected for an
              // open-ended crawl.
              <Progress value={pagesDiscovered > 0 ? Math.min(100, (pagesCrawled / pagesDiscovered) * 100) : 0} className="flex-col-reverse gap-3 mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground font-medium w-full">
                  <span>{pagesCrawled} crawled &bull; {pagesDiscovered} discovered</span>
                  <ProgressValue />
                </div>
              </Progress>
            )}

            {!isAnalyzing ? (
              <Button variant="outline" size="sm" className="self-end" onClick={handleCancel} disabled={isCancelling}>
                {isCancelling ? <Loader2 className="size-4 animate-spin" /> : null}
                Cancel audit
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {recentPages.length > 0 && (
          <Card className="max-w-3xl mx-auto w-full bg-card/50 shadow-none border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                Recently crawled
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/50">
              {recentPages.map((page: { id: string; url: string; statusCode: number; title: string | null }) => (
                <div key={page.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-foreground">{page.title || page.url}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="truncate max-w-[240px] text-xs text-muted-foreground">{page.url}</span>
                    <Badge
                      variant={
                        page.statusCode >= 200 && page.statusCode < 300
                          ? "success"
                          : page.statusCode >= 300 && page.statusCode < 400
                            ? "info"
                            : "destructive"
                      }
                    >
                      {page.statusCode || "Error"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (status === "failed" && !auditRun?.siteAuditPages?.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border p-8 text-center flex flex-col items-center justify-center gap-3">
          <OctagonAlert className="size-8 text-destructive" />
          <p className="text-lg font-medium">Audit Failed</p>
          <p className="text-sm text-muted-foreground">The crawler encountered an unrecoverable error.</p>
        </div>
      </div>
    );
  }

  if (isFullLoading || !auditRun) {
    return (
      <div className="flex flex-col gap-4">
        <StatGridSkeleton items={4} />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  const startedAtStr = new Date(auditRun.startedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.domain}</h1>
            {auditRun.status === "complete" && (
              <Badge variant="success" className="gap-1.5">
                <CheckCircle2 className="size-3" /> Done
              </Badge>
            )}
            {auditRun.status === "failed" && (
              <Badge variant="destructive" className="gap-1.5">
                <OctagonAlert className="size-3" /> Failed - showing partial results
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => setShowNewAudit((v) => !v)}>
              {showNewAudit ? "Cancel" : "New audit"}
            </Button>
            {auditRun.status === "complete" ? (
              <Button variant="soft-blue" size="sm" className="gap-2" render={<Link href={`/site-audit/${auditId}/deep-check`} />}>
                <Link2 className="size-4" /> Broken links & more
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Site audit &bull; Started {startedAtStr}</p>
        {showNewAudit ? (
          <div className="mt-3">
            <SiteAuditLaunchControl project={project} buttonLabel="Re-crawl" onLaunched={(newAuditId) => router.push(`/site-audit?auditId=${newAuditId}&tab=issues`)} />
          </div>
        ) : null}
      </div>

      {/* Summary row - same MetricCard grid GSC/GA Insights use. No "vs
          last audit" delta - Site Audit keeps exactly one audit per
          project (see start-site-audit.ts), so there's never a real prior
          score to compare against. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pages crawled" value={auditRun.pagesCrawled} icon={FileText} />
        <MetricCard label="Health score" value={auditRun.healthScore} suffix="/100" icon={ShieldCheck} accent="primary" />
        <MetricCard
          label="Issues found"
          value={coreIssues.length}
          icon={AlertTriangle}
          deltaLabel={`${counts.critical} critical · ${counts.warning} warning · ${counts.info} info`}
        />
        <MetricCard label="Avg response" value={avgResponseTime} suffix="ms" icon={Zap} />
      </div>

      {/* Tabs, filters, and actions all attached to the table below as one
          cohesive bordered unit - same pattern as GSC/GA Insights. */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Tabs value={tab} onValueChange={(val) => router.replace(`/site-audit?auditId=${auditId}&tab=${val}`)}>
          <div className="flex flex-wrap items-center gap-4 border-b px-3 py-2">
            <TabsList variant="line">
              <TabsTrigger value="issues">Issues ({coreIssues.length})</TabsTrigger>
              <TabsTrigger value="pages">Pages ({auditRun.siteAuditPages.length})</TabsTrigger>
            </TabsList>

            {tab === "issues" ? (
              <FilterSelect
                value={severityFilter}
                onValueChange={(value) => setSeverityFilter(value as "all" | IssueSeverity)}
                options={SEVERITY_FILTERS}
                triggerClassName="w-44"
              />
            ) : null}

            {tab === "pages" ? (
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Filter by URL or title..." value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} className="pl-8 h-8" />
              </div>
            ) : null}

            {tab === "issues" ? (
              <span className="text-sm text-muted-foreground">
                {issueRows.length} of {coreIssues.length}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              {auditRun ? <IndexNowSubmitAction projectId={project.id} crawledUrls={auditRun.siteAuditPages.map((p) => p.url)} /> : null}
              {tab === "issues" ? (
                <Button variant="soft-indigo" size="sm" className="gap-2" onClick={handleExport}>
                  <Download className="size-4" /> Export
                </Button>
              ) : null}
            </div>
          </div>

          <div>
            <TabsContent value="issues">
              <DataTable
                columns={siteAuditIssueColumns}
                data={issueRows}
                pageSize={20}
                emptyMessage="No issues match this filter."
                bordered={false}
              />
            </TabsContent>

            <TabsContent value="pages">
              <SiteAuditPagesTable auditId={auditId} projectId={project.id} domain={project.domain} pages={auditRun.siteAuditPages} search={pageSearch} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
