"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Download, ExternalLink, MinusCircle, Search, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/empty-state";
import { PromptTrendChart } from "@/components/ai-visibility/prompt-trend-chart";
import { VisibilitySparkline } from "@/components/ai-visibility/visibility-sparkline";
import { AiVisibilityFilterBar } from "@/components/ai-visibility/ai-visibility-filter-bar";
import { fillLastValueCarriedForward, type RawDailyValues } from "@seo-tool/ai-visibility";
import { cn } from "@/lib/utils";

export type RawStat = { date: string; provider: string; model: string; entityKey: string; mentioned: number; total: number };
export type PromptData = { id: string; promptText: string; tags: string[]; enabled: boolean; stats: RawStat[] };
export type Entity = { key: string; label: string };
type ProviderOption = { id: string; label: string };

type Summary = {
  totalPromptsTracked: number;
  totalRuns: number;
  totalCitations: number;
  overallSparkline: Array<{ date: string; visibilityPercent: number }>;
  currentVisibilityPercent: number;
};

type SortKey = "visibility-desc" | "visibility-asc" | "alpha";

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

// days === 0 is the "all time" sentinel (AI_VISIBILITY_DAY_OPTIONS).
function cutoffIso(days: number): string {
  if (days === 0) return "0000-00-00";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return cutoff.toISOString().slice(0, 10);
}

// Real per-(date, entity) mention rate for one prompt, filtered to the
// selected day window and model - recomputed client-side from the raw
// (date, provider, entity, mentioned, total) rows the server sent, so
// switching "All models"/a specific AI or the day window never needs a
// server round-trip.
//
// Gap-filled with last-value-carried-forward (trend-smoothing.ts) per
// entity: a date has an entry in `dates` as soon as ANY entity has a real
// run that day, but not every entity necessarily ran that same day (there's
// no scheduler yet, so runs are irregular per-entity too) - without LVCF
// that entity's line would drop to a false 0% on days it simply wasn't
// sampled, alongside a real value on days it was.
export function computePromptChartData(prompt: PromptData, entities: Entity[], days: number, model: string) {
  const cutoff = cutoffIso(days);

  // Filtered by the real (provider, model) pair via s.model - not
  // s.provider, which would collapse BrightData's 5 distinct AI surfaces
  // (chatgpt/gemini/perplexity/copilot/google-ai-overview) into one bucket
  // since they all share provider="brightdata".
  const filtered = prompt.stats.filter((s) => s.date >= cutoff && (model === "all" || s.model === model));

  const byDate = new Map<string, Map<string, { mentioned: number; total: number }>>();
  for (const s of filtered) {
    const dateEntry = byDate.get(s.date) ?? new Map();
    const entry = dateEntry.get(s.entityKey) ?? { mentioned: 0, total: 0 };
    entry.mentioned += s.mentioned;
    entry.total += s.total;
    dateEntry.set(s.entityKey, entry);
    byDate.set(s.date, dateEntry);
  }

  const dates = [...byDate.keys()].sort();
  const entityKeys = entities.map((e) => e.key);
  const raw = new Map<string, RawDailyValues<string>>();
  for (const date of dates) {
    const entry = byDate.get(date)!;
    const dayValues: RawDailyValues<string> = {};
    for (const key of entityKeys) {
      const stat = entry.get(key);
      if (stat && stat.total > 0) dayValues[key] = Math.round((stat.mentioned / stat.total) * 100);
    }
    raw.set(date, dayValues);
  }
  // Cast: entries with no real-or-carried-forward value yet for a given key
  // simply omit that key (see fillLastValueCarriedForward) rather than
  // setting it to a fabricated 0 - PromptTrendChart's Line renders those as
  // gaps via connectNulls, and callers here only ever index a key that's
  // known to have a value.
  const chartData = fillLastValueCarriedForward(dates, raw, entityKeys) as Array<Record<string, string | number>>;

  const brandEntity = entities[0]!;
  const lastRow = chartData.at(-1);
  const currentPercent = lastRow && typeof lastRow[brandEntity.key] === "number" ? (lastRow[brandEntity.key] as number) : 0;

  return { chartData, currentPercent, hasData: chartData.length > 0 };
}

// Real per-model mention rate for THIS prompt's brand entity, within the
// selected day window - answers "which LLMs am I showing up in vs not,"
// distinct from the blended-across-all-models trend chart above. `null`
// means this model never ran a real sample for this prompt in the window
// (never tracked here), not 0% (a real, sampled, zero-mention result).
export function computeModelBreakdown(
  prompt: PromptData,
  brandEntityKey: string,
  days: number,
  providers: ProviderOption[],
): Array<{ modelId: string; label: string; percent: number | null }> {
  const cutoff = cutoffIso(days);
  return providers.map((p) => {
    const rows = prompt.stats.filter((s) => s.date >= cutoff && s.model === p.id && s.entityKey === brandEntityKey);
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const mentioned = rows.reduce((sum, r) => sum + r.mentioned, 0);
    return { modelId: p.id, label: p.label, percent: total > 0 ? Math.round((mentioned / total) * 100) : null };
  });
}

function ModelBreakdownRow({ prompt, entities, days, allProviders }: { prompt: PromptData; entities: Entity[]; days: number; allProviders: ProviderOption[] }) {
  const breakdown = useMemo(
    () => computeModelBreakdown(prompt, entities[0]!.key, days, allProviders),
    [prompt, entities, days, allProviders],
  );
  if (breakdown.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {breakdown.map((m) => {
        const variant = m.percent === null ? "outline" : m.percent >= 50 ? "success" : m.percent > 0 ? "warning" : "destructive";
        const Icon = m.percent === null ? MinusCircle : m.percent >= 50 ? CheckCircle2 : m.percent > 0 ? CircleAlert : XCircle;
        return (
          <Badge key={m.modelId} variant={variant} className="gap-1 font-normal">
            <Icon className="size-3" />
            {m.label}
            {m.percent !== null ? ` · ${m.percent}%` : " · no data"}
          </Badge>
        );
      })}
    </div>
  );
}

function PromptCard({
  prompt,
  entities,
  days,
  model,
  allProviders,
}: {
  prompt: PromptData;
  entities: Entity[];
  days: number;
  model: string;
  allProviders: ProviderOption[];
}) {
  const { chartData, currentPercent, hasData } = useMemo(
    () => computePromptChartData(prompt, entities, days, model),
    [prompt, entities, days, model],
  );

  function exportCsv() {
    const header = ["date", ...entities.map((e) => e.label)];
    const rows = chartData.map((row) => [row.date as string, ...entities.map((e) => row[e.key] as number)]);
    downloadCsv(`${prompt.promptText.slice(0, 40).replace(/[^a-z0-9]+/gi, "-")}.csv`, [header, ...rows]);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-semibold">{prompt.promptText}</h4>
          <Badge variant={!hasData ? "outline" : currentPercent >= 50 ? "success" : currentPercent > 0 ? "warning" : "destructive"}>
            {currentPercent}% Visibility
          </Badge>
        </div>

        <ModelBreakdownRow prompt={prompt} entities={entities} days={days} allProviders={allProviders} />

        {!hasData ? (
          <p className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
            No runs for this prompt in the selected window.
          </p>
        ) : (
          <PromptTrendChart data={chartData} entities={entities} />
        )}

        <div className="flex items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" className="gap-1.5" render={<Link href={`/ai-visibility/visibility/${prompt.id}`} />}>
            <ExternalLink className="size-3.5" />
            View Details
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!hasData}>
            <Download className="size-3.5" />
            Export (CSV)
          </Button>
          {prompt.tags.length > 0 ? (
            <div className="ml-auto flex flex-wrap gap-1">
              {prompt.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function VisibilityDashboard({
  prompts,
  entities,
  allTags,
  allProviders,
  summary,
}: {
  prompts: PromptData[];
  entities: Entity[];
  allTags: string[];
  allProviders: ProviderOption[];
  summary: Summary;
}) {
  const [days, setDays] = useState<number>(30);
  const [model, setModel] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("visibility-desc");
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      prompts.map((p) => ({
        prompt: p,
        ...computePromptChartData(p, entities, days, model),
      })),
    [prompts, entities, days, model],
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.prompt.promptText.toLowerCase().includes(q));
    }
    if (selectedTags.size > 0) {
      result = result.filter((r) => r.prompt.tags.some((t) => selectedTags.has(t)));
    }
    const sorted = [...result];
    if (sortBy === "visibility-desc") sorted.sort((a, b) => b.currentPercent - a.currentPercent);
    else if (sortBy === "visibility-asc") sorted.sort((a, b) => a.currentPercent - b.currentPercent);
    else sorted.sort((a, b) => a.prompt.promptText.localeCompare(b.prompt.promptText));
    return sorted;
  }, [rows, search, selectedTags, sortBy]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <AiVisibilityFilterBar
          model={model}
          onModelChange={setModel}
          modelOptions={allProviders.map((p) => ({ value: p.id, label: p.label }))}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          allTags={allTags}
          days={days}
          onDaysChange={setDays}
        />

        <FilterSelect
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortKey)}
          options={[
            { value: "visibility-desc", label: "Sort: Visibility ↓" },
            { value: "visibility-asc", label: "Sort: Visibility ↑" },
            { value: "alpha", label: "Sort: A → Z" },
          ]}
          triggerClassName="w-44"
        />

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search prompts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      <Card
        className={cn(
          summary.currentVisibilityPercent >= 50
            ? "border-success/20 bg-success/[0.03]"
            : summary.currentVisibilityPercent >= 20
              ? "border-warning/20 bg-warning/[0.03]"
              : "border-destructive/20 bg-destructive/[0.03]",
        )}
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums",
                summary.currentVisibilityPercent >= 50
                  ? "text-success"
                  : summary.currentVisibilityPercent >= 20
                    ? "text-warning"
                    : "text-destructive",
              )}
            >
              {summary.currentVisibilityPercent}%
            </span>
            <span className="text-sm text-muted-foreground">Visibility</span>
            <VisibilitySparkline
              data={summary.overallSparkline}
              dataKey="visibilityPercent"
              color={summary.currentVisibilityPercent >= 50 ? "var(--success)" : summary.currentVisibilityPercent >= 20 ? "var(--warning)" : "var(--destructive)"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="font-semibold text-foreground">{summary.totalPromptsTracked}</strong> prompts
            </span>
            <span>
              <strong className="font-semibold text-foreground">{summary.totalRuns.toLocaleString()}</strong> runs
            </span>
            <span>
              <strong className="font-semibold text-foreground">{summary.totalCitations.toLocaleString()}</strong> citations
            </span>
          </div>
        </CardContent>
      </Card>

      {filteredRows.length === 0 ? (
        <EmptyState icon={Search} title="No matching prompts" description="Try a different search or clear the tag filter." />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredRows.map(({ prompt }) => (
            <PromptCard key={prompt.id} prompt={prompt} entities={entities} days={days} model={model} allProviders={allProviders} />
          ))}
        </div>
      )}
    </div>
  );
}
