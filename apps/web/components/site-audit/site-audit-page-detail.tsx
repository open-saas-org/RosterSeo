"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ExternalLink, FileText, ImageIcon, Link2, Loader2, Unlink, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { SeverityBadge } from "@/components/site-audit/severity-badge";
import type { IssueSeverity } from "@/components/site-audit/audit-engine";

type PageDetail = {
  page: {
    id: string;
    url: string;
    statusCode: number;
    title: string | null;
    h1Count: number;
    wordCount: number;
    imageCount: number;
    loadTimeMs: number;
    redirectedTo: string | null;
  };
  issues: { id: string; severity: IssueSeverity; category: string; description: string }[];
  inboundLinks: string[];
  outboundLinks: { targetUrl: string; isExternal: boolean; statusCode: number | null }[];
};

function toPath(url: string, domain: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const withoutDomain = withoutScheme.startsWith(domain) ? withoutScheme.slice(domain.length) : withoutScheme;
  return withoutDomain === "" ? "/" : withoutDomain;
}

export function SiteAuditPageDetail({ project, auditId, pageId }: { project: { id: string; domain: string }; auditId: string; pageId: string }) {
  const { data, isLoading, error } = useQuery<PageDetail>({
    queryKey: ["site-audit-page-detail", project.id, auditId, pageId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/site-audit/${auditId}/pages/${pageId}`);
      if (!res.ok) throw new Error("Failed to load page detail");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="rounded-lg border p-8 text-center text-destructive">Couldn&apos;t load this page.</div>;
  }

  const { page, issues, inboundLinks, outboundLinks } = data;
  const isOrphan = issues.some((i) => i.category === "Orphaned Pages");
  const cannibalization = issues.filter((i) => i.category === "Keyword Cannibalization");
  const brokenOutbound = issues.filter((i) => i.category === "Broken Links");

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-col gap-4 border-b pb-6">
        <Link href={`/site-audit?auditId=${auditId}&tab=pages`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to Pages
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="truncate text-xl font-bold tracking-tight">{toPath(page.url, project.domain)}</h1>
          <Badge variant={page.statusCode >= 200 && page.statusCode < 300 ? "success" : page.statusCode >= 300 && page.statusCode < 400 ? "info" : "destructive"}>{page.statusCode}</Badge>
          {isOrphan ? (
            <Badge variant="warning" className="gap-1">
              <Unlink className="size-3" /> Orphaned
            </Badge>
          ) : null}
        </div>
        <a href={page.url} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm text-primary hover:underline">
          {page.url} <ExternalLink className="size-3" />
        </a>
        {page.title ? <p className="text-sm text-muted-foreground">{page.title}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Word count" value={page.wordCount} icon={FileText} />
        <MetricCard label="Images" value={page.imageCount} icon={ImageIcon} />
        <MetricCard label="Load time" value={page.loadTimeMs} suffix="ms" icon={Zap} />
        <MetricCard label="Inbound links" value={inboundLinks.length} icon={Link2} />
      </div>

      {page.redirectedTo ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Redirects to <a href={page.redirectedTo} target="_blank" rel="noreferrer" className="text-primary hover:underline">{page.redirectedTo}</a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Issues on this page</CardTitle>
          <CardDescription>Every real issue found for this URL during the audit.</CardDescription>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues found on this page.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-start gap-2.5 rounded-lg border p-2.5">
                  <SeverityBadge severity={issue.severity} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{issue.category}</p>
                    <p className="text-sm">{issue.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {cannibalization.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Keyword cannibalization</CardTitle>
            <CardDescription>Queries in Search Console where this page competes with another page on the site.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cannibalization.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-sm">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {c.description}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {brokenOutbound.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Broken links from this page</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {brokenOutbound.map((b) => (
              <div key={b.id} className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {b.description}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inbound links ({inboundLinks.length})</CardTitle>
            <CardDescription>Other crawled pages that link here.</CardDescription>
          </CardHeader>
          <CardContent>
            {inboundLinks.length === 0 ? (
              <EmptyState icon={Unlink} title="No inbound links" description="No other crawled page links to this URL." />
            ) : (
              <div className="flex flex-col gap-1.5">
                {inboundLinks.map((url) => (
                  <span key={url} className="truncate text-sm text-muted-foreground">
                    {toPath(url, project.domain)}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outbound links ({outboundLinks.length})</CardTitle>
            <CardDescription>Everything this page links to.</CardDescription>
          </CardHeader>
          <CardContent>
            {outboundLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outbound links found.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {outboundLinks.map((link) => (
                  <div key={link.targetUrl} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{link.isExternal ? link.targetUrl : toPath(link.targetUrl, project.domain)}</span>
                    {link.statusCode !== null && link.statusCode >= 400 ? <Badge variant="destructive">{link.statusCode}</Badge> : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
