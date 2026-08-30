"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { KeywordMetrics } from "@seo-tool/dataforseo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { KeywordResearchTable } from "@/components/keywords/keyword-research-table";
import { KeywordSearchTrendsChart } from "@/components/keywords/keyword-search-trends-chart";
import { KeywordSerpAnalysisPanel } from "@/components/keywords/keyword-serp-analysis-panel";
import { IntentBadge } from "@/components/keywords/intent-badge";
import { KeywordDifficulty } from "@/components/keywords/keyword-difficulty";
import type { KeywordCountryOption, KeywordSearchHistoryEntry, SourcedKeywordMetrics } from "@/components/keywords/keyword-research-types";

// Top-level client component for the rebuilt Keyword Research page: seed +
// location search bar, a seed-summary header card, the results table, and
// a right-hand detail panel (trend chart + SERP preview) for whichever
// keyword is currently selected - real DataForSEO data end to end, real
// persistence (every fetched keyword's metrics are cached, every search is
// logged), no mock-shaped fake suggestions.
export function KeywordResearchWorkspace({
  projectId,
  initialLocationCode,
  initialLocationName,
  initialTrackedKeywords,
  initialHistory,
}: {
  projectId: string;
  initialLocationCode: number;
  initialLocationName: string;
  initialTrackedKeywords: string[];
  initialHistory: KeywordSearchHistoryEntry[];
}) {
  const [seed, setSeed] = useState("");
  const [countries, setCountries] = useState<KeywordCountryOption[] | null>(null);
  const [locationCode, setLocationCode] = useState(initialLocationCode);
  const [locationName, setLocationName] = useState(initialLocationName);

  const [seedMetrics, setSeedMetrics] = useState<KeywordMetrics | null>(null);
  const [results, setResults] = useState<SourcedKeywordMetrics[] | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const [trackedKeys, setTrackedKeys] = useState<Set<string>>(() => new Set(initialTrackedKeywords));
  const [history, setHistory] = useState<KeywordSearchHistoryEntry[]>(initialHistory);

  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/local-seo/business-profile/geo?level=country`)
      .then((res) => res.json())
      .then((data) => setCountries(data.options ?? []))
      .catch(() => {});
  }, [projectId]);

  const runSearch = useCallback(
    async (seedOverride?: string, locOverride?: { code: number; name: string }) => {
      const trimmed = (seedOverride ?? seed).trim();
      if (!trimmed) {
        setError("Enter a seed keyword to research.");
        return;
      }
      const code = locOverride?.code ?? locationCode;
      const name = locOverride?.name ?? locationName;

      setIsSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/keyword-research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seedKeyword: trimmed, locationCode: code, locationName: name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Couldn't fetch keyword ideas. Try again.");
        setSeed(trimmed);
        setLocationCode(code);
        setLocationName(name);
        setSeedMetrics(data.seed);
        setResults(data.results);
        setSelectedKeyword(data.seed.keyword);

        fetch(`/api/projects/${projectId}/keyword-research`)
          .then((r) => r.json())
          .then((d) => setHistory(d.searches ?? []))
          .catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't fetch keyword ideas. Try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [projectId, seed, locationCode, locationName],
  );

  const handleTrack = useCallback(
    async (keywords: string[]) => {
      setError(null);
      const toAdd = keywords.filter((k) => !trackedKeys.has(k.toLowerCase()));
      if (toAdd.length === 0) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: toAdd }),
        });
        if (!res.ok) throw new Error();
        setTrackedKeys((prev) => {
          const next = new Set(prev);
          for (const k of toAdd) next.add(k.toLowerCase());
          return next;
        });
      } catch {
        setError("Couldn't track those keywords. Try again.");
      }
    },
    [projectId, trackedKeys],
  );

  const selectedTrend =
    selectedKeyword === seedMetrics?.keyword
      ? (seedMetrics?.trend ?? [])
      : (results?.find((r) => r.keyword === selectedKeyword)?.trend ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="seed-keyword" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Seed keyword
          </Label>
          <Input
            id="seed-keyword"
            placeholder="e.g. rank tracker"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
          />
        </div>
        <div className="w-full sm:w-56">
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Location</Label>
          <Select
            value={String(locationCode)}
            onValueChange={(v) => {
              const match = countries?.find((c) => String(c.code) === v);
              if (match) {
                setLocationCode(match.code);
                setLocationName(match.name);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={countries === null ? "Loading…" : locationName} />
            </SelectTrigger>
            <SelectContent>
              {(countries ?? []).map((c) => (
                <SelectItem key={c.code} value={String(c.code)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => runSearch()} disabled={isSearching}>
          {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
          Research
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!results ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            Search a seed keyword to see ideas, related terms, and questions here.
          </div>
          {history.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Recent searches</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => runSearch(h.seedKeyword, { code: h.locationCode, name: h.locationName })}
                    className="flex items-center justify-between gap-3 py-2.5 text-left text-sm hover:text-primary"
                  >
                    <span className="font-medium">{h.seedKeyword}</span>
                    <span className="text-xs text-muted-foreground">
                      {h.locationName} · {h.resultCount} results
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {seedMetrics ? (
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 pt-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight">{seedMetrics.keyword}</h2>
                    <KeywordDifficulty score={seedMetrics.difficulty} />
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">Vol</span>
                    <span className="font-semibold tabular-nums">{seedMetrics.searchVolume.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">CPC</span>
                    <span className="font-semibold tabular-nums">${seedMetrics.cpc.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">Comp</span>
                    <span className="font-semibold tabular-nums">{seedMetrics.competition === null ? "—" : seedMetrics.competition.toFixed(2)}</span>
                  </div>
                  <IntentBadge intent={seedMetrics.intent} />
                </CardContent>
              </Card>
            ) : null}

            <KeywordResearchTable
              results={results}
              trackedKeys={trackedKeys}
              onTrack={handleTrack}
              onSelectKeyword={setSelectedKeyword}
              selectedKeyword={selectedKeyword}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {selectedKeyword ? (
              <>
                <KeywordSearchTrendsChart keyword={selectedKeyword} trend={selectedTrend} />
                <KeywordSerpAnalysisPanel projectId={projectId} keyword={selectedKeyword} locationCode={locationCode} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
