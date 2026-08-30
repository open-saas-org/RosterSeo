"use client";

import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { AiVisibilityTrendAreaChart } from "@/components/ai-visibility/ai-visibility-trend-area-chart";
import { ShareOfVoiceDonut } from "@/components/ai-visibility/share-of-voice-donut";
import { AiVisibilityFilterBar } from "@/components/ai-visibility/ai-visibility-filter-bar";
import { fillLastValueCarriedForward, dailyDateRange, type RawDailyValues } from "@rosterseo/ai-visibility";

type RawRow = { date: string; provider: string; model: string; promptId: string; runId: string; entityKey: string; mentioned: boolean };
type Entity = { key: string; label: string; isBrand: boolean };
type ProviderOption = { id: string; label: string };
type PromptTags = { id: string; tags: string[] };

// days === 0 is the "all time" sentinel (AI_VISIBILITY_DAY_OPTIONS) -
// "0000-00-00" sorts before every real ISO date string, so the `r.date >=
// cutoff` filters below become a no-op instead of needing a separate
// branch everywhere they're used.
function cutoffIso(days: number): string {
  if (days === 0) return "0000-00-00";
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export function ShareOfVoiceDashboard({
  rows,
  entities,
  prompts,
  allTags,
  allProviders,
  brandName,
}: {
  rows: RawRow[];
  entities: Entity[];
  prompts: PromptTags[];
  allTags: string[];
  allProviders: ProviderOption[];
  brandName: string;
}) {
  const [days, setDays] = useState<number>(30);
  const [model, setModel] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const allowedPromptIds = useMemo(() => {
    if (selectedTags.size === 0) return null;
    return new Set(prompts.filter((p) => p.tags.some((t) => selectedTags.has(t))).map((p) => p.id));
  }, [prompts, selectedTags]);

  const filtered = useMemo(() => {
    const cutoff = cutoffIso(days);
    return rows.filter(
      (r) =>
        r.date >= cutoff &&
        // Filtered by the real (provider, model) pair via r.model, not
        // r.provider - see the page-level comment for why.
        (model === "all" || r.model === model) &&
        (allowedPromptIds === null || allowedPromptIds.has(r.promptId)),
    );
  }, [rows, days, model, allowedPromptIds]);

  const { leaderboard, trend, currentPercent, totalRuns } = useMemo(() => {
    const mentionsByEntity = new Map<string, number>();
    const promptSetByEntity = new Map<string, Set<string>>();
    const byDayBrand = new Map<string, { brand: number; total: number }>();
    const runIds = new Set<string>();

    for (const r of filtered) {
      runIds.add(r.runId);
      if (!r.mentioned) continue;
      mentionsByEntity.set(r.entityKey, (mentionsByEntity.get(r.entityKey) ?? 0) + 1);
      const set = promptSetByEntity.get(r.entityKey) ?? new Set();
      set.add(r.promptId);
      promptSetByEntity.set(r.entityKey, set);

      const day = byDayBrand.get(r.date) ?? { brand: 0, total: 0 };
      day.total += 1;
      if (r.entityKey === "brand") day.brand += 1;
      byDayBrand.set(r.date, day);
    }

    const totalMentions = [...mentionsByEntity.values()].reduce((a, b) => a + b, 0);

    const leaderboard = entities
      .map((e) => {
        const mentions = mentionsByEntity.get(e.key) ?? 0;
        return {
          entity: e,
          mentions,
          share: totalMentions > 0 ? Math.round((mentions / totalMentions) * 100) : 0,
          promptCount: promptSetByEntity.get(e.key)?.size ?? 0,
        };
      })
      .sort((a, b) => b.mentions - a.mentions);

    // Real per-day % (days with zero mentions across every entity aren't
    // real "0%" data points - they're no signal at all - so byDayBrand only
    // has entries for days something was actually mentioned), gap-filled
    // with last-value-carried-forward across the full window so the line
    // doesn't jump straight from one sparse real day to the next.
    const raw = new Map<string, RawDailyValues<"pct">>();
    for (const [date, { brand, total }] of byDayBrand.entries()) {
      raw.set(date, { pct: total > 0 ? Math.round((brand / total) * 100) : 0 });
    }
    const realDates = [...byDayBrand.keys()].sort();
    const spanDays =
      days !== 0
        ? days
        : realDates.length === 0
          ? 1
          : Math.max(1, Math.ceil((Date.now() - new Date(`${realDates[0]}T00:00:00Z`).getTime()) / 86_400_000) + 1);
    const range = dailyDateRange(spanDays);
    const trend = fillLastValueCarriedForward(range, raw, ["pct"] as const)
      .filter((p) => p.pct !== undefined)
      .map((p) => ({ date: p.date, shareOfVoicePercent: p.pct! }));

    const currentPercent = trend.at(-1)?.shareOfVoicePercent ?? 0;

    return { leaderboard, trend, currentPercent, totalRuns: runIds.size };
  }, [filtered, entities, days]);

  const competitorCount = entities.length - 1;

  // Donut: brand's real slice + the top 2 real competitors by current
  // mentions + one "Other" slice folding in everyone else - an all-pairs
  // comparison only clears the validated palette's first 3 categorical
  // slots (dataviz skill), so this never shows more than 3 real colors.
  const donutSlices = useMemo(() => {
    const brandRow = leaderboard.find((r) => r.entity.isBrand);
    const topCompetitors = leaderboard.filter((r) => !r.entity.isBrand).slice(0, 2);
    const shown = new Set([brandRow?.entity.key, ...topCompetitors.map((r) => r.entity.key)]);
    const otherMentions = leaderboard.filter((r) => !shown.has(r.entity.key)).reduce((sum, r) => sum + r.mentions, 0);

    const slices = [
      ...(brandRow ? [{ key: brandRow.entity.key, label: brandRow.entity.label, value: brandRow.mentions }] : []),
      ...topCompetitors.map((r) => ({ key: r.entity.key, label: r.entity.label, value: r.mentions })),
    ];
    if (otherMentions > 0) slices.push({ key: "other", label: "Other", value: otherMentions });
    return slices;
  }, [leaderboard]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No visibility runs yet"
        description="Run a visibility check from the Visibility page to see how your brand compares to your tracked competitors. Add competitors from the Competitors shortcut in the top bar first for a real comparison."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Share of Voice</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <span className="text-5xl font-bold tabular-nums text-ai-accent">{currentPercent}%</span>
              <p className="mt-2 text-sm text-muted-foreground">
                {brandName} across {totalRuns.toLocaleString()} run{totalRuns === 1 ? "" : "s"} and {competitorCount} competitor
                {competitorCount === 1 ? "" : "s"}.
              </p>
            </div>
            {donutSlices.length > 0 ? <ShareOfVoiceDonut slices={donutSlices} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share of Voice Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">No runs in this window yet.</p>
            ) : (
              <AiVisibilityTrendAreaChart data={trend} dataKey="shareOfVoicePercent" label="Share of Voice %" colorVar="var(--chart-1)" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Share of Voice Leaderboard</CardTitle>
          <CardDescription>Real mention counts across every tracked prompt in this window.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-10 py-2 pl-4 font-medium">#</th>
                  <th className="py-2 font-medium">Brand</th>
                  <th className="py-2 pr-3 text-right font-medium">Mentions</th>
                  <th className="py-2 pr-3 font-medium">Share</th>
                  <th className="w-20 py-2 pr-4 text-right font-medium">Prompts</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={row.entity.key} className="border-b last:border-0">
                    <td className="py-2.5 pl-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 font-medium">
                      <span className="flex items-center gap-2">
                        {row.entity.label}
                        {row.entity.isBrand ? (
                          <Badge variant="seo" className="text-xs">
                            You
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.mentions}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${row.share}%`,
                              backgroundColor: row.entity.isBrand
                                ? "var(--chart-1)"
                                : i < 6
                                  ? `var(--chart-${(i % 6) + 1})`
                                  : "var(--muted-foreground)",
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{row.share}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{row.promptCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
