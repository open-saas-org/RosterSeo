"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Network, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { AiVisibilityFilterBar } from "@/components/ai-visibility/ai-visibility-filter-bar";
import { cn } from "@/lib/utils";
import { computeFanoutAnalysis, type FanoutAnalysis, type FanoutInputRow, type FanoutQueryStat, type FanoutWordStat } from "@seo-tool/ai-visibility";

type PromptTags = { id: string; tags: string[] };
type ModelOption = { value: string; label: string };
type WordChangeKey = "added" | "preserved" | "dropped";

// days === 0 is the "all time" sentinel (AI_VISIBILITY_DAY_OPTIONS).
function cutoffIso(days: number): string {
  if (days === 0) return "0000-00-00";
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function WordCloud({ words }: { words: FanoutWordStat[] }) {
  if (words.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No real captured queries yet.</p>;
  }
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  const scale = (count: number) => {
    if (max === min) return 1;
    return 0.8 + ((count - min) / (max - min)) * 1.6; // 0.8rem .. 2.4rem-ish via em multiplier
  };
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 py-6">
      {words.map((w) => (
        <span
          key={w.word}
          className="font-medium text-foreground/80 hover:text-foreground"
          style={{ fontSize: `${scale(w.count)}rem`, opacity: 0.55 + (scale(w.count) / 2.4) * 0.45 }}
          title={`${w.count} occurrences`}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

function WordChangeBars({ words, total }: { words: FanoutWordStat[]; total: number }) {
  if (words.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  const max = words[0]!.count;
  return (
    <div className="flex flex-col gap-4">
      {words.map((w) => (
        <div key={w.word} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span>{w.word}</span>
            <span className="tabular-nums text-muted-foreground">
              {w.count.toLocaleString()} {total > 0 ? `${Math.round((w.count / total) * 100)}%` : ""}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-ai-accent" style={{ width: `${(w.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Real prompt words this word/token came from, matched case-insensitively -
// used to bold the tokens an AI engine *kept* from the original prompt
// inside its rewritten search query, so it's visible at a glance what got
// added vs. carried over.
function promptWordSet(promptText: string): Set<string> {
  return new Set((promptText.toLowerCase().match(/[a-z0-9]+/g) ?? []));
}

// Renders `query` with any word also present in `promptText` bolded.
// Splits on word boundaries (capturing group keeps the separators - spaces,
// punctuation - in the output so the original query string reads back
// exactly) and compares case-insensitively while preserving original casing
// for display.
function HighlightedQuery({ query, promptText }: { query: string; promptText?: string }) {
  if (!promptText) return <>{query}</>;
  const promptWords = promptWordSet(promptText);
  const segments = query.split(/([a-zA-Z0-9]+)/g);
  return (
    <>
      {segments.map((seg, i) =>
        /^[a-zA-Z0-9]+$/.test(seg) && promptWords.has(seg.toLowerCase()) ? (
          <span key={i} className="font-semibold text-foreground">
            {seg}
          </span>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </>
  );
}

function QueryStatRow({ stat, promptText, indent }: { stat: { query: string; runCount: number }; promptText?: string; indent?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", indent && "pl-4")}>
      <span className="min-w-0 flex-1 truncate">
        <HighlightedQuery query={stat.query} promptText={promptText} />
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{stat.runCount}x</span>
    </div>
  );
}

function PromptFanOutRow({ prompt }: { prompt: FanoutAnalysis["perPrompt"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? prompt.queries : prompt.queries.slice(0, 10);

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-start gap-2">
          {expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="truncate font-medium">{prompt.promptText}</p>
            <p className="text-xs text-muted-foreground">{prompt.distinctQueryCount} variations</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums text-muted-foreground">
          <span>{prompt.distinctQueryCount}</span>
          <span>{prompt.avgPerRun}</span>
        </div>
      </button>
      {expanded ? (
        <div className="border-t bg-muted/20 px-4 py-2 pl-10">
          {shown.map((q) => (
            <QueryStatRow key={q.query} stat={q} promptText={prompt.promptText} />
          ))}
          {!showAll && prompt.distinctQueryCount > shown.length ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Top {shown.length} of {prompt.distinctQueryCount} variations shown
              </p>
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                View Details
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TopQueryRow({ stat }: { stat: FanoutQueryStat }) {
  const [expanded, setExpanded] = useState(false);
  // A top query can span multiple different source prompts (that's the
  // whole point of "top"), so there's no single canonical prompt text to
  // diff against - the most-frequent originating prompt (byPrompt is sorted
  // by count desc) is the best representative to bold keep-vs-add against.
  const representativePromptText = stat.byPrompt[0]?.promptText;
  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">
            <HighlightedQuery query={stat.query} promptText={representativePromptText} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-sm tabular-nums text-muted-foreground">
          <span>{stat.promptCount}</span>
          <span>{stat.runCount}</span>
          <span className={cn(stat.brandMentionRate >= 50 ? "text-ai-accent" : "text-muted-foreground")}>{stat.brandMentionRate}%</span>
        </span>
      </button>
      {expanded ? (
        <div className="border-t bg-muted/20 px-4 py-2 pl-10">
          {stat.byPrompt.map((p) => (
            <div key={p.promptId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.promptText}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{p.count}x</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QueryFanOutDashboard({
  rows,
  prompts,
  allTags,
  allModels,
}: {
  rows: FanoutInputRow[];
  prompts: PromptTags[];
  allTags: string[];
  allModels: ModelOption[];
}) {
  const [days, setDays] = useState<number>(30);
  const [model, setModel] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [promptSearch, setPromptSearch] = useState("");
  const [hideStopWords, setHideStopWords] = useState(true);
  const [wordChangeTab, setWordChangeTab] = useState<WordChangeKey>("added");
  const [topQuerySort, setTopQuerySort] = useState<"runs" | "prompts">("runs");

  const allowedPromptIds = useMemo(() => {
    if (selectedTags.size === 0) return null;
    return new Set(prompts.filter((p) => p.tags.some((t) => selectedTags.has(t))).map((p) => p.id));
  }, [prompts, selectedTags]);

  const filteredRows = useMemo(() => {
    const cutoff = cutoffIso(days);
    return rows.filter(
      (r) => r.date >= cutoff && (model === "all" || r.model === model) && (allowedPromptIds === null || allowedPromptIds.has(r.promptId)),
    );
  }, [rows, days, model, allowedPromptIds]);

  const analysis = useMemo(() => computeFanoutAnalysis(filteredRows), [filteredRows]);

  // topByPrompts (ranked by distinct-prompt breadth) was computed but never
  // rendered - the toggle above lets a user switch to it instead of only
  // ever seeing topByRuns (raw recurrence count).
  const topQueries = topQuerySort === "prompts" ? analysis.topByPrompts : analysis.topByRuns;

  const visiblePrompts = useMemo(() => {
    const q = promptSearch.trim().toLowerCase();
    const list = q ? analysis.perPrompt.filter((p) => p.promptText.toLowerCase().includes(q)) : analysis.perPrompt;
    return list.filter((p) => p.fanoutRuns > 0);
  }, [analysis.perPrompt, promptSearch]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const cloudWords = hideStopWords ? analysis.termCloud.filter((w) => !w.isStopword) : analysis.termCloud;
  const wordChangeWords = (hideStopWords ? analysis.wordChanges[wordChangeTab].filter((w) => !w.isStopword) : analysis.wordChanges[wordChangeTab]);

  return (
    <div className="flex flex-col gap-4">
      <AiVisibilityFilterBar
        model={model}
        onModelChange={setModel}
        modelOptions={allModels}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        allTags={allTags}
        days={days}
        onDaysChange={setDays}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="Search Prompt Runs" value={analysis.totalRuns.toLocaleString()} icon={Network} deltaLabel="real sample attempts" />
        <MetricCard label="Prompt Runs w/ Unknown Queries" value={analysis.unknownQueryRuns.toLocaleString()} icon={Network} deltaLabel="no captured query text" />
        <MetricCard label="Prompt Runs w/ Known Queries" value={analysis.fanoutRuns.toLocaleString()} icon={Network} deltaLabel="real queries captured" />
        <MetricCard label="Average Fan-Out" value={analysis.avgFanOut} icon={Network} deltaLabel="queries per search" />
      </div>

      {analysis.fanoutRuns === 0 ? (
        <EmptyState
          icon={Network}
          title="No real search-query data yet"
          description="This page shows the actual web searches an AI engine issued while answering your tracked prompts - only providers that expose search queries produce this (BrightData scraped runs, or OpenRouter with web search enabled). Configure one in Settings → Providers, then run a visibility check."
        />
      ) : (
        <Tabs defaultValue="prompt-fan-out">
          <TabsList>
            <TabsTrigger value="prompt-fan-out">Prompt Fan-Out</TabsTrigger>
            <TabsTrigger value="top-queries">Top Queries</TabsTrigger>
            <TabsTrigger value="query-words">Query Words</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt-fan-out" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Prompts</CardTitle>
                  <CardDescription>The web searches each prompt triggers.</CardDescription>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search prompts..." value={promptSearch} onChange={(e) => setPromptSearch(e.target.value)} className="pl-8" />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-y bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  <span>PROMPT</span>
                  <span className="flex gap-4">
                    <span>QUERIES</span>
                    <span>AVG/PROMPT RUN</span>
                  </span>
                </div>
                {visiblePrompts.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matching prompts.</p>
                ) : (
                  visiblePrompts.map((p) => <PromptFanOutRow key={p.promptId} prompt={p} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="top-queries" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Top Queries</CardTitle>
                  <CardDescription>The searches that recur across your prompts.</CardDescription>
                </div>
                <div className="flex overflow-hidden rounded-md border">
                  {(
                    [
                      { key: "runs" as const, label: "By Runs" },
                      { key: "prompts" as const, label: "By Prompts" },
                    ]
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTopQuerySort(key)}
                      className={cn(
                        "px-3 py-1.5 text-sm",
                        topQuerySort === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-y bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  <span>QUERY</span>
                  <span className="flex gap-4">
                    <span>PROMPTS</span>
                    <span>PROMPT RUNS</span>
                    <span>BRAND MENTION %</span>
                  </span>
                </div>
                {topQueries.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No recurring queries yet.</p>
                ) : (
                  topQueries.map((stat) => <TopQueryRow key={stat.query} stat={stat} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="query-words" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardContent className="pt-6">
                <WordCloud words={cloudWords} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Word Changes</CardTitle>
                  <CardDescription>How engines rewrite your prompt wording.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={hideStopWords} onCheckedChange={setHideStopWords} size="sm" />
                    Hide stop words
                  </label>
                  <div className="flex overflow-hidden rounded-md border">
                    {(["added", "preserved", "dropped"] as WordChangeKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWordChangeTab(key)}
                        className={cn(
                          "px-3 py-1.5 text-sm capitalize",
                          wordChangeTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <WordChangeBars words={wordChangeWords} total={analysis.totalQueries} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
