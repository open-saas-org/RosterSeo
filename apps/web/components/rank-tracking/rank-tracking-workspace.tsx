"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AddKeywordsDialog } from "@/components/rank-tracking/add-keywords-dialog";
import { RankTrackingConfigDialog } from "@/components/rank-tracking/rank-tracking-config-dialog";
import { RankTrackingPositionChart } from "@/components/rank-tracking/rank-tracking-position-chart";
import { RankTrackingTable } from "@/components/rank-tracking/rank-tracking-table";
import { PageHeader } from "@/components/page-header";
import type { RankCheckRunProgress, RankTrackingSettings, TrackedKeyword } from "@/components/keywords/rank-tracking-types";

// Top-level client component for the rebuilt Rank Tracking page: header
// (domain + config summary + Configure/Add Keywords), the position
// distribution chart, and the keyword table. Adding keywords never calls
// DataForSEO - only Fetch Rankings (here or per-row "check now") does, via
// a background job (packages/jobs' rankCheckJob) polled the same way Site
// Audit's crawl progress is polled.
export function RankTrackingWorkspace({
  projectId,
  domain,
  initialSettings,
  initialTracked,
  initialRunId,
}: {
  projectId: string;
  domain: string;
  initialSettings: RankTrackingSettings;
  initialTracked: TrackedKeyword[];
  initialRunId: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState(initialSettings);
  useEffect(() => setSettings(initialSettings), [initialSettings]);

  const [tracked, setTracked] = useState(initialTracked);
  useEffect(() => setTracked(initialTracked), [initialTracked]);

  const [configOpen, setConfigOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRunId);

  const { data: progress } = useQuery({
    queryKey: ["rank-check-progress", projectId, activeRunId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rank-tracking/runs/${activeRunId}/progress`);
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json() as Promise<RankCheckRunProgress>;
    },
    enabled: activeRunId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 1500 : false;
    },
  });

  useEffect(() => {
    if (!activeRunId || !progress) return;
    if (progress.status === "completed" || progress.status === "failed") {
      setActiveRunId(null);
      queryClient.invalidateQueries({ queryKey: ["rank-trend", projectId] });
      router.refresh();
    }
  }, [activeRunId, progress, projectId, queryClient, router]);

  const handleUntrack = useCallback(
    (id: string) => {
      setError(null);
      const previous = tracked;
      setTracked((prev) => prev.filter((t) => t.id !== id));
      fetch(`/api/projects/${projectId}/keywords/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) {
          setTracked(previous);
          setError("Couldn't untrack that keyword. Try again.");
        }
      });
    },
    [projectId, tracked],
  );

  const handleBulkUntrack = useCallback(
    (ids: string[]) => {
      setError(null);
      const previous = tracked;
      const idSet = new Set(ids);
      setTracked((prev) => prev.filter((t) => !idSet.has(t.id)));
      Promise.all(ids.map((id) => fetch(`/api/projects/${projectId}/keywords/${id}`, { method: "DELETE" }))).then(
        (results) => {
          if (results.some((r) => !r.ok)) {
            setTracked(previous);
            setError("Couldn't remove some keywords. Try again.");
          }
        },
      );
    },
    [projectId, tracked],
  );

  const handleCheckedKeyword = useCallback(
    (id: string, result: { position: number | null; url: string | null; checkedAt: string; serpFeatures: string[]; isMock: boolean }) => {
      setTracked((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                previousPosition: t.currentPosition,
                currentPosition: result.position,
                currentUrl: result.url,
                serpFeatures: result.serpFeatures,
                checkedAt: result.checkedAt,
                isMock: result.isMock,
              }
            : t,
        ),
      );
    },
    [],
  );

  const handleFetchRankings = useCallback(
    async (keywordIds?: string[]) => {
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/rank-tracking/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywordIds }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.error === "run_in_progress") throw new Error("A rank check is already running for this project.");
          if (data.error === "no_keywords") throw new Error("No keywords to check.");
          throw new Error("Couldn't start the rank check.");
        }
        setActiveRunId(data.runId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start the rank check.");
      }
    },
    [projectId],
  );

  const handleAdded = useCallback(() => {
    setAddOpen(false);
    router.refresh();
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rank Tracking"
        description={`Position, history, and volume for every keyword tracked for ${domain}.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <Settings2 className="size-4 mr-2" /> Configure
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-2" /> Add Keywords
            </Button>
          </>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {tracked.some((t) => t.isMock) ? (
        <Alert className="border-lavender/30 bg-lavender/5">
          <AlertTitle>Some positions below are demo data</AlertTitle>
          <AlertDescription>
            DataForSEO was unavailable the last time one or more keywords were checked, so those rows show
            deterministic demo positions instead of a real Google check - look for the &ldquo;Demo data&rdquo; tag
            in the Position column. Re-run Fetch Rankings once DataForSEO is configured to replace them with real
            checks.
          </AlertDescription>
        </Alert>
      ) : null}

      <RankTrackingPositionChart projectId={projectId} />

      <RankTrackingTable
        projectId={projectId}
        tracked={tracked}
        onUntrack={handleUntrack}
        onBulkUntrack={handleBulkUntrack}
        onCheckedKeyword={handleCheckedKeyword}
        onFetchRankings={handleFetchRankings}
        runProgress={activeRunId ? (progress ?? { status: "pending", keywordsTotal: 0, keywordsChecked: 0, errorMessage: null }) : null}
      />

      <RankTrackingConfigDialog
        projectId={projectId}
        open={configOpen}
        onOpenChange={setConfigOpen}
        settings={settings}
        onSaved={(next) => {
          setSettings(next);
          setConfigOpen(false);
        }}
      />
      <AddKeywordsDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} onAdded={handleAdded} />
    </div>
  );
}
