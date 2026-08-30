"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import type { SerpResult } from "@rosterseo/dataforseo";

// Real top-10 organic SERP for whichever keyword is currently selected in
// the results table - fetched on demand per selection (not bundled into
// the search response, which can have 50 results) via checkKeywordRanking
// under the hood (see the API route for why not getSerpResults).
export function KeywordSerpAnalysisPanel({
  projectId,
  keyword,
  locationCode,
}: {
  projectId: string;
  keyword: string;
  locationCode: number;
}) {
  const [results, setResults] = useState<SerpResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setResults(null);
    fetch(
      `/api/projects/${projectId}/keyword-research/serp?keyword=${encodeURIComponent(keyword)}&locationCode=${locationCode}`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Couldn't load SERP results.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setResults(data.results ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load SERP results.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, keyword, locationCode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="size-4 text-seo" /> SERP Analysis
        </CardTitle>
        <CardDescription>{keyword}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !results || results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organic results found for this keyword.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{results.length} organic results</p>
            <ol className="flex flex-col divide-y">
              {results.map((result) => (
                <li key={`${result.position}-${result.url}`} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {result.position}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-sm font-medium text-primary hover:underline"
                    >
                      <span className="truncate">{result.title || result.domain}</span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                    <span className="truncate text-xs text-muted-foreground">{result.domain}</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
