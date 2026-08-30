"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderBadge, ProviderIcon } from "@/components/ai-visibility/provider-badge";
import { AI_VISIBILITY_CATALOG, DEFAULT_OPENROUTER_MODEL, targetKey } from "@/lib/ai-visibility-catalog";
import { getModelDisplayLabel } from "@rosterseo/ai-visibility";

type SelectableTarget = { provider: string; model: string; label: string; webSearch: boolean };

// Just the "run a real check" controls - prompt management now lives on
// Settings -> Prompts (real tags/enable-toggle/bulk-delete), and results are
// rendered by VisibilityDashboard below this card, which reloads via
// router.refresh() after a run completes rather than holding its own copy
// of the results.
export function AiVisibilityRunControls({
  projectId,
  configured,
  providerStatus,
  activeTargets,
  hasPrompts,
}: {
  projectId: string;
  configured: boolean;
  providerStatus: Record<string, boolean>;
  activeTargets: Array<{ provider: string; model: string }>;
  hasPrompts: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openRouterTarget = activeTargets.find((t) => t.provider === "openrouter");
  const openRouterModel = openRouterTarget?.model ?? DEFAULT_OPENROUTER_MODEL;
  const selectableTargets: SelectableTarget[] = useMemo(
    () => [
      ...AI_VISIBILITY_CATALOG.map((c) => ({ provider: c.provider, model: c.model, label: c.label, webSearch: c.webSearch })),
      { provider: "openrouter", model: openRouterModel, label: getModelDisplayLabel("openrouter", openRouterModel), webSearch: true },
    ],
    [openRouterModel],
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(activeTargets.map((t) => targetKey(t.provider, t.model))),
  );
  const selectedTargets = selectableTargets.filter((t) => selectedKeys.has(targetKey(t.provider, t.model)));

  function toggleTarget(provider: string, model: string) {
    const key = targetKey(provider, model);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function runCheck() {
    if (!hasPrompts || selectedTargets.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/ai-visibility/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            samplesPerProvider: 3,
            targets: selectedTargets.map((t) => ({
              provider: t.provider,
              model: t.model,
              webSearch: t.webSearch,
              version: t.provider === "openrouter" ? t.model : undefined,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Visibility check failed");
        // Real results are re-fetched server-side (VisibilityDashboard's
        // data lives in the page, not client state here).
        router.refresh();
      } catch {
        setError("Visibility check failed to run. Try again.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium whitespace-nowrap">AIs to sample:</span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1.5" />}>
              {selectedTargets.length === 0 ? "Select AIs" : `${selectedTargets.length} selected`}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Pick any AIs, any count</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {selectableTargets.map((t) => {
                const key = targetKey(t.provider, t.model);
                const isConfigured = providerStatus[t.provider];
                return (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={selectedKeys.has(key)}
                    disabled={!isConfigured}
                    onCheckedChange={() => toggleTarget(t.provider, t.model)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <ProviderIcon provider={t.provider} model={t.model} className="size-3.5 mr-2" />
                    {t.label}
                    {!isConfigured ? <span className="ml-auto text-xs text-muted-foreground">not configured</span> : null}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedTargets.map((t) => (
            <ProviderBadge key={targetKey(t.provider, t.model)} provider={t.provider} model={t.model} iconOnly />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button onClick={runCheck} disabled={isPending || !hasPrompts || selectedTargets.length === 0} size="sm" className="h-9">
            {isPending ? "Running…" : "Run visibility check"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive absolute mt-12">{error}</p> : null}
    </>
  );
}
