"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Ban, Link2, Loader2, Search, Sparkles, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SeverityBadge } from "@/components/site-audit/severity-badge";
import type { IssueSeverity } from "@/components/site-audit/audit-engine";

type DeepCheckIssue = { id: string; severity: IssueSeverity; category: string; url: string; description: string; pageId: string | null };

type DeepCheckResult = {
  auditStatus: string;
  deepCheckStatus: string | null;
  crawlCompleted: boolean;
  linkGraphComplete: boolean;
  issues: DeepCheckIssue[];
};

function toPath(url: string, domain: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const withoutDomain = withoutScheme.startsWith(domain) ? withoutScheme.slice(domain.length) : withoutScheme;
  return withoutDomain === "" ? "/" : withoutDomain;
}

function IssueRow({ issue, auditId, domain }: { issue: DeepCheckIssue; auditId: string; domain: string }) {
  const content = (
    <div className="flex items-start gap-2.5 rounded-lg border p-2.5">
      <SeverityBadge severity={issue.severity} />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{toPath(issue.url, domain)}</p>
        <p className="text-sm">{issue.description}</p>
      </div>
    </div>
  );
  return issue.pageId ? (
    <Link href={`/site-audit/${auditId}/pages/${issue.pageId}`} className="block transition-colors hover:bg-muted/50 rounded-lg">
      {content}
    </Link>
  ) : (
    content
  );
}

export function SiteAuditDeepCheck({ project, auditId }: { project: { id: string; domain: string }; auditId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<DeepCheckResult>({
    queryKey: ["site-audit-deep-check", project.id, auditId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/site-audit/${auditId}/deep-check`);
      if (!res.ok) throw new Error("Failed to load deep check");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.deepCheckStatus;
      return status === "pending" || status === "running" ? 1500 : false;
    },
  });

  async function handleRun() {
    await fetch(`/api/projects/${project.id}/site-audit/${auditId}/deep-check`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["site-audit-deep-check", project.id, auditId] });
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const brokenLinks = data.issues.filter((i) => i.category === "Broken Links");
  const orphanedPages = data.issues.filter((i) => i.category === "Orphaned Pages");
  const cannibalization = data.issues.filter((i) => i.category === "Keyword Cannibalization");

  const isRunning = data.deepCheckStatus === "pending" || data.deepCheckStatus === "running";
  const hasRun = data.deepCheckStatus === "complete";

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-col gap-4 border-b pb-6">
        <Link href={`/site-audit?auditId=${auditId}&tab=issues`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to audit
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Broken links, orphaned pages & cannibalization</h1>
            <p className="text-sm text-muted-foreground">
              A separate, deeper pass over this audit&apos;s crawl data - checks real external links, pages nothing links to, and Search Console queries where
              multiple pages compete.
            </p>
          </div>
          {!isRunning ? (
            <Button onClick={handleRun} className="gap-2 shrink-0">
              <Sparkles className="size-4" /> {hasRun ? "Re-run check" : "Run deep check"}
            </Button>
          ) : null}
        </div>
      </div>

      {data.auditStatus !== "complete" ? (
        <EmptyState icon={Ban} title="Audit not finished" description="This deep check runs against a completed site audit's crawl data." />
      ) : isRunning ? (
        <Card className="mx-auto max-w-2xl w-full">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="font-medium">Checking links and Search Console data&hellip;</p>
            <p className="text-sm text-muted-foreground">External links are checked live, so this can take a few minutes on a large site.</p>
          </CardContent>
        </Card>
      ) : !hasRun ? (
        <EmptyState
          icon={Search}
          title="Not run yet"
          description="Run the deep check to find broken outbound links, pages nothing on your site links to, and keyword cannibalization from Search Console."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {!data.crawlCompleted || !data.linkGraphComplete ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {!data.crawlCompleted
                ? "The crawl this audit ran stopped early (page limit or timeout), so orphaned-page detection was skipped to avoid false positives."
                : "This site's link graph was larger than what gets stored per audit, so orphaned-page detection was skipped to avoid false positives."}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-seo" /> Broken links ({brokenLinks.length})
              </CardTitle>
              <CardDescription>Internal links to pages that returned an error, and external links that are unreachable or broken.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {brokenLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No broken links found.</p>
              ) : (
                brokenLinks.map((issue) => <IssueRow key={issue.id} issue={issue} auditId={auditId} domain={project.domain} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unlink className="size-4 text-seo" /> Orphaned pages ({orphanedPages.length})
              </CardTitle>
              <CardDescription>Live pages that no other page on the site links to.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {orphanedPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {data.crawlCompleted && data.linkGraphComplete ? "No orphaned pages found." : "Skipped - see note above."}
                </p>
              ) : (
                orphanedPages.map((issue) => <IssueRow key={issue.id} issue={issue} auditId={auditId} domain={project.domain} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-seo" /> Keyword cannibalization ({cannibalization.length})
              </CardTitle>
              <CardDescription>Queries in Search Console where more than one page on the site is showing.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {cannibalization.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cannibalization found, or Search Console isn&apos;t connected for this project.</p>
              ) : (
                cannibalization.map((issue) => <IssueRow key={issue.id} issue={issue} auditId={auditId} domain={project.domain} />)
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
