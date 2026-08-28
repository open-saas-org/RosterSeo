"use client";

import { useState, useTransition } from "react";
import { Clock, ExternalLink, Gauge, Link2, Loader2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { BacklinksTable } from "@/components/backlinks/backlinks-table";
import { fetchBacklinksOverview, type BacklinksOverviewResult } from "@/app/(dashboard)/backlinks/actions";

export type BacklinksHistoryEntry = { domain: string; fetchedAt: string };

export function BacklinksWorkspace({
  projectId,
  initialHistory,
}: {
  projectId: string;
  initialHistory: BacklinksHistoryEntry[];
}) {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<BacklinksOverviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [history, setHistory] = useState(initialHistory);

  function runSearch(overrideDomain?: string) {
    const trimmed = (overrideDomain ?? domain).trim();
    if (!trimmed) {
      setError("Enter a domain to look up.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const next = await fetchBacklinksOverview(projectId, trimmed);
        setResult(next);
        setDomain(next.overview.domain);
        setHistory((prev) => [
          { domain: next.overview.domain, fetchedAt: new Date().toISOString() },
          ...prev.filter((h) => h.domain !== next.overview.domain),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't fetch backlinks overview. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Domain search</CardTitle>
          <CardDescription>
            Enter a domain to pull its total backlinks, referring domains, and domain rating.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="backlinks-domain">
                Domain
              </label>
              <Input
                id="backlinks-domain"
                placeholder="e.g. example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
            </div>
            <Button onClick={() => runSearch()} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Search />}
              Look up
            </Button>
          </div>
          {history.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                Recent:
              </span>
              {history.map((h) => (
                <button
                  key={h.domain}
                  type="button"
                  onClick={() => runSearch(h.domain)}
                  disabled={isPending}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  {h.domain}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load backlinks overview</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {!result ? (
        <EmptyState
          icon={Link2}
          title="No domain looked up yet"
          description="Search a domain above to see its backlink profile from the built-in backlink index."
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{result.overview.domain}</h3>
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={`https://${result.overview.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                    <span className="sr-only">Open {result.overview.domain}</span>
                  </a>
                }
              />
              <TooltipContent>Open {result.overview.domain}</TooltipContent>
            </Tooltip>
            {result.fromCache ? <Badge variant="secondary">Cached</Badge> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Total backlinks"
              value={result.overview.totalBacklinks.toLocaleString()}
              deltaLabel="Backlink index"
              trend="up"
              icon={Link2}
            />
            <MetricCard
              label="Referring domains"
              value={result.overview.referringDomains.toLocaleString()}
              deltaLabel="Backlink index"
              trend="up"
              icon={Link2}
            />
            <MetricCard
              label="Domain rating"
              value={result.overview.domainRating}
              suffix="/100"
              deltaLabel="Backlink index"
              trend="up"
              icon={Gauge}
              accent="primary"
            />
          </div>

          <Alert>
            <AlertTitle>Not a full backlink audit</AlertTitle>
            <AlertDescription>
              This backlink index is a lightweight estimate and isn&apos;t as deep as a specialized tool like
              Ahrefs. Treat these numbers as a directional signal, not an authoritative crawl.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Individual backlinks</CardTitle>
              <CardDescription>
                Up to 200 real referring links, filterable by type and quality. Add any of them straight to Backlink
                Outreach.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BacklinksTable backlinks={result.backlinks} projectId={projectId} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
