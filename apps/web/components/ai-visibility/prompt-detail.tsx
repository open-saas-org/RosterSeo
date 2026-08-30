"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptTrendChart } from "@/components/ai-visibility/prompt-trend-chart";
import { CitationsDashboard } from "@/components/ai-visibility/citations-dashboard";
import { QueryFanOutDashboard } from "@/components/ai-visibility/query-fan-out-dashboard";
import { AI_VISIBILITY_DAY_OPTIONS, DAY_OPTION_LABELS } from "@/components/ai-visibility/ai-visibility-filter-bar";
import { computePromptChartData, type Entity, type PromptData, type RawStat } from "@/components/ai-visibility/visibility-dashboard";
import type { CitationRow, FanoutInputRow } from "@rosterseo/ai-visibility";

type ModelOption = { value: string; label: string };

type LlmResponse = {
  id: string;
  provider: string;
  modelLabel: string;
  runAt: string;
  mentioned: boolean;
  sentiment: string | null;
  position: number | null;
  responseSnippet: string | null;
  citationCount: number;
  // The full raw provider payload this row was parsed from (jsonb, so it
  // could be an object/array or - for providers where only a plain-text
  // completion is captured - a JSON string). Null for rows predating the
  // rawOutput column or where capturing it failed; providers are being
  // wired up to populate it separately, so this must always be handled as
  // possibly absent even on new rows.
  rawOutput: unknown;
  // Other tracked brands/competitors mentioned in this exact same run
  // (same runId, entityDomain rows sharing the call this brand row came
  // from) - domains only, already filtered to mentioned: true.
  alsoMentioned: string[];
};

// Renders rawOutput for the "View full response" expando: pretty-printed
// when it's structured (object/array, or a JSON-string that parses), plain
// text otherwise - rawOutput's real shape varies per provider (a chat
// completion vs. a scraped BrightData snapshot), so both are handled.
function formatRawOutput(rawOutput: unknown): string {
  if (typeof rawOutput === "string") {
    try {
      return JSON.stringify(JSON.parse(rawOutput), null, 2);
    } catch {
      return rawOutput;
    }
  }
  try {
    return JSON.stringify(rawOutput, null, 2);
  } catch {
    return String(rawOutput);
  }
}

function ResponseRow({ response }: { response: LlmResponse }) {
  const [showRaw, setShowRaw] = useState(false);
  const date = new Date(response.runAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{response.modelLabel}</span>
        <Badge variant={response.mentioned ? "success" : "outline"}>{response.mentioned ? "Mentioned" : "Not mentioned"}</Badge>
        {response.sentiment ? (
          <Badge variant={response.sentiment === "positive" ? "success" : response.sentiment === "negative" ? "destructive" : "outline"} className="capitalize">
            {response.sentiment}
          </Badge>
        ) : null}
        {response.position !== null ? <span className="text-xs text-muted-foreground">position ~{response.position}</span> : null}
        {response.citationCount > 0 ? <span className="text-xs text-muted-foreground">{response.citationCount} citation{response.citationCount === 1 ? "" : "s"}</span> : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{date}</span>
      </div>
      {response.responseSnippet ? <p className="text-sm text-muted-foreground">{response.responseSnippet}</p> : null}
      {response.alsoMentioned.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Also mentioned: <span className="text-foreground">{response.alsoMentioned.join(", ")}</span>
        </p>
      ) : null}
      {response.rawOutput ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showRaw ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            View full response
          </button>
          {showRaw ? (
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words">
              {formatRawOutput(response.rawOutput)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MentionsTab({ prompt, entities }: { prompt: PromptData; entities: Entity[] }) {
  const [days, setDays] = useState<number>(30);
  const [model, setModel] = useState<string>("all");

  const models = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of prompt.stats) seen.set(s.model, s.model);
    return [...seen.keys()];
  }, [prompt.stats]);

  const { chartData, hasData } = useMemo(() => computePromptChartData(prompt, entities, days, model), [prompt, entities, days, model]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <FilterSelect
          value={model}
          onValueChange={setModel}
          options={[{ value: "all", label: "All models" }, ...models.map((m) => ({ value: m, label: m }))]}
          triggerClassName="w-44"
        />
        <FilterSelect
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
          options={AI_VISIBILITY_DAY_OPTIONS.map((d) => ({ value: String(d), label: DAY_OPTION_LABELS[d]! }))}
          triggerClassName="w-40"
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          {!hasData ? (
            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No runs for this prompt in the selected window.</p>
          ) : (
            <PromptTrendChart data={chartData} entities={entities} />
          )}
        </CardContent>
      </Card>
      {hasData ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="py-2 pl-3 font-medium">Date</th>
                {entities.map((e) => (
                  <th key={e.key} className="py-2 pr-3 text-right font-medium">
                    {e.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.date as string} className="border-b last:border-0">
                  <td className="py-1.5 pl-3 tabular-nums">{row.date}</td>
                  {entities.map((e) => (
                    <td key={e.key} className="py-1.5 pr-3 text-right tabular-nums">
                      {row[e.key]}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function PromptDetail({
  prompt,
  entities,
  stats,
  citationRows,
  webQueryRows,
  llmResponses,
  allModels,
  brandDomain,
}: {
  prompt: { id: string; promptText: string; tags: string[]; enabled: boolean };
  entities: Entity[];
  stats: RawStat[];
  citationRows: CitationRow[];
  webQueryRows: FanoutInputRow[];
  llmResponses: LlmResponse[];
  allModels: ModelOption[];
  brandDomain: string;
}) {
  const promptData: PromptData = { ...prompt, stats };
  const promptTagsList = [{ id: prompt.id, tags: prompt.tags }];

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex flex-col gap-3 border-b pb-6">
        <Link href="/ai-visibility/visibility" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to Visibility
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">{prompt.promptText}</h1>
          {!prompt.enabled ? <Badge variant="outline">Paused</Badge> : null}
        </div>
        {prompt.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {prompt.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="mentions">
        <TabsList>
          <TabsTrigger value="mentions">Mentions</TabsTrigger>
          <TabsTrigger value="web-queries">Web Queries</TabsTrigger>
          <TabsTrigger value="citations">Citations</TabsTrigger>
          <TabsTrigger value="llm-responses">LLM Responses</TabsTrigger>
        </TabsList>

        <TabsContent value="mentions" className="mt-4">
          <MentionsTab prompt={promptData} entities={entities} />
        </TabsContent>

        <TabsContent value="web-queries" className="mt-4">
          <QueryFanOutDashboard rows={webQueryRows} prompts={promptTagsList} allTags={prompt.tags} allModels={allModels} />
        </TabsContent>

        <TabsContent value="citations" className="mt-4">
          <CitationsDashboard rows={citationRows} prompts={promptTagsList} allTags={prompt.tags} allModels={allModels} brandDomain={brandDomain} />
        </TabsContent>

        <TabsContent value="llm-responses" className="mt-4">
          {llmResponses.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No runs yet" description="Run a visibility check to see individual LLM responses for this prompt." />
          ) : (
            <Card>
              <CardContent className="flex flex-col p-0">
                {llmResponses.map((r) => (
                  <ResponseRow key={r.id} response={r} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
