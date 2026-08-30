"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Calculator, Loader2, Save } from "lucide-react";
import { PROVIDER_COST_ESTIMATES_USD } from "@seo-tool/ai-visibility";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import { OpenRouterModelPicker } from "@/components/ai-visibility/openrouter-model-picker";
import { AI_VISIBILITY_CATALOG as CATALOG, DEFAULT_OPENROUTER_MODEL, targetKey as keyFor } from "@/lib/ai-visibility-catalog";

type Target = { model: string; provider: string; version?: string; webSearch: boolean; enabled: boolean };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ProvidersSettingsWorkspace({
  projectId,
  providerStatus,
}: {
  projectId: string;
  // Real isConfigured() per provider id, computed server-side (env vars
  // aren't readable client-side) - without this, toggling a provider on
  // here looked and felt like connecting it (a Switch, a cost estimate, a
  // "Save" button), when it was only ever picking what to route a run to
  // if credentials happen to exist elsewhere.
  providerStatus: Record<string, boolean>;
}) {
  const { data, isLoading } = useSWR<{ targets: Target[] }>(`/api/projects/${projectId}/ai-visibility/targets`, fetcher);
  // Reused just to count enabled tracked prompts for the cost projection
  // below - the Prompts page (ai-visibility-prompts-workspace.tsx) is the
  // real owner of this data, this is a read-only count.
  const { data: promptsData } = useSWR<{ prompts: Array<{ enabled: boolean }> }>(`/api/projects/${projectId}/ai-visibility`, fetcher);

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  // Matches defaultTargets() (packages/ai-visibility/src/client.ts) - a
  // never-configured project defaults to BrightData's 5 scraped surfaces
  // only, OpenRouter off. Real native web search on a frontier model is
  // genuinely expensive per call, not something to bill by default.
  const [openRouterEnabled, setOpenRouterEnabled] = useState(false);
  const [openRouterModel, setOpenRouterModel] = useState(DEFAULT_OPENROUTER_MODEL);
  const [openRouterWebSearch, setOpenRouterWebSearch] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // No scheduler exists yet (runs are triggered manually from the
  // Visibility page today) - this is purely a "what would it cost if you
  // ran this often" projection, not a real recurring spend. Defaults to
  // once a day, a common cadence for this category of tool.
  const [assumedRunsPerDay, setAssumedRunsPerDay] = useState(1);

  useEffect(() => {
    if (!data || initialized) return;
    if (data.targets.length === 0) {
      // No custom targets saved yet - reflect the real default behavior
      // (POST .../run falls back to defaultTargets(): BrightData's 5
      // scraped surfaces only, OpenRouter off - openRouterEnabled's own
      // useState(false) above covers that half of this default).
      setEnabled(new Set(CATALOG.filter((c) => c.defaultEnabled).map((c) => keyFor(c.provider, c.model))));
    } else {
      const keys = new Set<string>();
      for (const t of data.targets) {
        if (t.provider === "openrouter") {
          setOpenRouterEnabled(t.enabled);
          setOpenRouterModel(t.version ?? DEFAULT_OPENROUTER_MODEL);
          setOpenRouterWebSearch(t.webSearch);
        } else if (t.enabled) {
          keys.add(keyFor(t.provider, t.model));
        }
      }
      setEnabled(keys);
    }
    setInitialized(true);
  }, [data, initialized]);

  const totalEnabled = enabled.size + (openRouterEnabled ? 1 : 0);

  function toggle(provider: string, model: string) {
    const key = keyFor(provider, model);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setSaved(false);
    const targets: Target[] = CATALOG.map((c) => ({
      provider: c.provider,
      model: c.model,
      webSearch: c.webSearch,
      enabled: enabled.has(keyFor(c.provider, c.model)),
    }));
    targets.push({ provider: "openrouter", model: openRouterModel, version: openRouterModel, webSearch: openRouterWebSearch, enabled: openRouterEnabled });

    const res = await fetch(`/api/projects/${projectId}/ai-visibility/targets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    setIsSaving(false);
    if (res.ok) setSaved(true);
  }

  const grouped = useMemo(() => {
    const direct = CATALOG.filter((c) => c.provider !== "brightdata");
    const brightdata = CATALOG.filter((c) => c.provider === "brightdata");
    return { direct, brightdata };
  }, []);

  // Real per-project cost estimate: sum of ≈$/run across every provider/model
  // actually enabled right now (mirrors what a real POST .../run call would
  // hit), times the number of enabled tracked prompts (each prompt is
  // sampled against every enabled target on a run), times the assumed run
  // cadence. Only ever an estimate - PROVIDER_COST_ESTIMATES_USD itself is
  // an estimate (see packages/ai-visibility/src/providers/constants.ts), and
  // there's no scheduler yet so "runs per day" is a hypothetical, not a
  // measured rate.
  const enabledPromptCount = promptsData?.prompts.filter((p) => p.enabled).length ?? 0;
  const costPerFullRunUsd = useMemo(() => {
    let sum = 0;
    for (const c of CATALOG) {
      if ((providerStatus[c.provider] ?? false) && enabled.has(keyFor(c.provider, c.model))) {
        sum += PROVIDER_COST_ESTIMATES_USD[c.provider] ?? 0;
      }
    }
    if (providerStatus.openrouter && openRouterEnabled) {
      sum += PROVIDER_COST_ESTIMATES_USD.openrouter ?? 0;
    }
    return sum;
  }, [enabled, openRouterEnabled, providerStatus]);
  const DAYS_PER_MONTH = 30;
  const projectedMonthlyCostUsd = enabledPromptCount * costPerFullRunUsd * Math.max(0, assumedRunsPerDay) * DAYS_PER_MONTH;

  if (isLoading) {
    return <ListSkeleton rows={5} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Direct APIs</CardTitle>
          <CardDescription>Call each provider&apos;s model directly - cheapest per run, but not the real consumer product UI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {grouped.direct.map((c) => {
            const isConfigured = providerStatus[c.provider] ?? false;
            return (
              <div key={keyFor(c.provider, c.model)} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{c.label}</span>
                <div className="flex items-center gap-2">
                  {isConfigured ? (
                    <span className="text-xs text-muted-foreground">≈${PROVIDER_COST_ESTIMATES_USD[c.provider]?.toFixed(3)}/run</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Not configured
                    </Badge>
                  )}
                  <Switch
                    checked={isConfigured && enabled.has(keyFor(c.provider, c.model))}
                    disabled={!isConfigured}
                    onCheckedChange={() => toggle(c.provider, c.model)}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            BrightData
            <Badge variant="seo" className="text-[10px]">
              real scrape
            </Badge>
          </CardTitle>
          <CardDescription>Real scraped consumer-product answers - what your customers actually see, including Google AI Overview.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {grouped.brightdata.map((c) => {
            const isConfigured = providerStatus[c.provider] ?? false;
            return (
              <div key={keyFor(c.provider, c.model)} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{c.label}</span>
                <div className="flex items-center gap-2">
                  {isConfigured ? (
                    <span className="text-xs text-muted-foreground">≈${PROVIDER_COST_ESTIMATES_USD.brightdata?.toFixed(3)}/run</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Not configured
                    </Badge>
                  )}
                  <Switch
                    checked={isConfigured && enabled.has(keyFor(c.provider, c.model))}
                    disabled={!isConfigured}
                    onCheckedChange={() => toggle(c.provider, c.model)}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            OpenRouter
            <Badge variant="lavender" className="text-[10px]">
              any model
            </Badge>
            {!providerStatus.openrouter ? (
              <Badge variant="outline" className="text-xs">
                Not configured
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>Pass-through to any OpenRouter-hosted model, one API key - search and pick a real model below.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Model</span>
            <OpenRouterModelPicker
              value={openRouterModel}
              onChange={(slug) => {
                setOpenRouterModel(slug);
                setSaved(false);
              }}
              disabled={!providerStatus.openrouter}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={openRouterWebSearch}
                disabled={!providerStatus.openrouter}
                onCheckedChange={(v) => {
                  setOpenRouterWebSearch(v);
                  setSaved(false);
                }}
              />
              Web search (:online)
            </label>
            <div className="flex items-center gap-2">
              {providerStatus.openrouter ? (
                <span className="text-xs text-muted-foreground">≈${PROVIDER_COST_ESTIMATES_USD.openrouter?.toFixed(3)}/run</span>
              ) : null}
              <Switch
                checked={providerStatus.openrouter === true && openRouterEnabled}
                disabled={!providerStatus.openrouter}
                onCheckedChange={(v) => {
                  setOpenRouterEnabled(v);
                  setSaved(false);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-muted-foreground" />
            Projected Monthly Cost
          </CardTitle>
          <CardDescription>
            An estimate, not a bill - runs are still triggered manually today (there&apos;s no scheduler yet), so this only shows what enabling these
            providers would cost <em>if</em> you ran every tracked prompt this often.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">If run</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={assumedRunsPerDay}
              onChange={(e) => setAssumedRunsPerDay(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-16 text-center"
            />
            <span className="text-muted-foreground">time{assumedRunsPerDay === 1 ? "" : "s"}/day, across {enabledPromptCount} enabled prompt{enabledPromptCount === 1 ? "" : "s"} and {totalEnabled} enabled provider{totalEnabled === 1 ? "" : "s"}:</span>
          </div>
          <span className="text-2xl font-bold tabular-nums">
            ≈${projectedMonthlyCostUsd.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
          </span>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving || totalEnabled === 0} className="gap-2">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
        {totalEnabled === 0 ? <p className="text-sm text-destructive">Enable at least one provider.</p> : null}
        {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      </div>
    </div>
  );
}
