"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2, MapPinned, Save, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { StatGridSkeleton } from "@/components/ui/loading-skeletons";
import { cn } from "@/lib/utils";
import type { GridMapPoint } from "@/components/local-seo/grid-map";

const GridMap = dynamic(() => import("@/components/local-seo/grid-map").then((m) => m.GridMap), {
  ssr: false,
  loading: () => <div className="flex h-96 items-center justify-center rounded-lg border text-sm text-muted-foreground">Loading map…</div>,
});

type ScanSummary = {
  id: string;
  keyword: string;
  gridSize: number;
  radiusKm: number;
  createdAt: string;
  avgPosition: number | null;
  pctInTop3: number;
};

type ScanDetail = {
  scan: { id: string; keyword: string; centerLat: number; centerLng: number; gridSize: number; radiusKm: number };
  points: GridMapPoint[];
  avgPosition: number | null;
  pctInTop3: number;
};

type MonitorConfig = { trackedKeyword: string | null; gridSize: number; radiusKm: number; autoTrackEnabled: boolean };

const GRID_SIZES = [3, 5, 7] as const;

export function MonitorWorkspace({
  projectId,
  hasProfile,
  initialConfig,
  initialScans,
}: {
  projectId: string;
  hasProfile: boolean;
  initialConfig: MonitorConfig | null;
  initialScans: ScanSummary[];
}) {
  const [savedKeyword, setSavedKeyword] = useState(initialConfig?.trackedKeyword ?? null);
  const [keyword, setKeyword] = useState(initialConfig?.trackedKeyword ?? "");
  const [gridSize, setGridSize] = useState<(typeof GRID_SIZES)[number]>((initialConfig?.gridSize as (typeof GRID_SIZES)[number]) ?? 5);
  const [radiusKm, setRadiusKm] = useState(String(initialConfig?.radiusKm ?? 5));
  const [autoTrackEnabled, setAutoTrackEnabled] = useState(initialConfig?.autoTrackEnabled ?? true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [scans, setScans] = useState<ScanSummary[]>(initialScans);
  const [active, setActive] = useState<ScanDetail | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingScan, setIsLoadingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [isGettingTip, setIsGettingTip] = useState(false);
  const [confirmingRun, setConfirmingRun] = useState(false);

  if (!hasProfile) {
    return (
      <EmptyState
        icon={MapPinned}
        title="Save a business profile first"
        description="Monitor tracks rank for the business saved on the Profile page."
        action={
          <Link href="/local-seo" className={cn(buttonVariants({ size: "sm" }))}>
            Go to Profile
          </Link>
        }
      />
    );
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || !(Number(radiusKm) > 0)) return;
    setIsSavingConfig(true);
    setConfigError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/monitor/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedKeyword: keyword.trim(), gridSize, radiusKm: Number(radiusKm), autoTrackEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavedKeyword(data.profile.trackedKeyword);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Couldn't save config. Try again.");
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleRunNow() {
    // A 7x7 grid is 49 real DataForSEO SERP calls in one scan - real
    // API cost and several seconds of real work, not a free re-check.
    // Require an explicit second click instead of firing on the first
    // press, same friction level as this app's other costly one-click
    // actions (matches the project-settings archive/delete pattern).
    if (gridSize * gridSize >= 49 && !confirmingRun) {
      setConfirmingRun(true);
      return;
    }
    setConfirmingRun(false);
    setIsScanning(true);
    setScanError(null);
    setTip(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/grid-scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setActive({ scan: data.scan, points: data.points, avgPosition: data.avgPosition, pctInTop3: data.pctInTop3 });
      setScans((prev) => [
        {
          id: data.scan.id,
          keyword: data.scan.keyword,
          gridSize: data.scan.gridSize,
          radiusKm: data.scan.radiusKm,
          createdAt: data.scan.createdAt,
          avgPosition: data.avgPosition,
          pctInTop3: data.pctInTop3,
        },
        ...prev,
      ]);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't run that scan. Try again.");
    } finally {
      setIsScanning(false);
    }
  }

  async function loadScan(scanId: string) {
    setIsLoadingScan(true);
    setTip(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/grid-scan/${scanId}`);
      const data = await res.json();
      if (res.ok) setActive(data);
    } finally {
      setIsLoadingScan(false);
    }
  }

  async function getGuidance() {
    if (!active) return;
    setIsGettingTip(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/grid-scan/${active.scan.id}/guidance`, { method: "POST" });
      const data = await res.json();
      setTip(data.tip ?? "No suggestion available - connect an LLM provider in AI Visibility > LLMs.");
    } finally {
      setIsGettingTip(false);
    }
  }

  const configDirty = keyword.trim() !== (savedKeyword ?? "");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tracking config</CardTitle>
          <CardDescription>What to track, and whether it re-checks automatically every week.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monitor-keyword">Keyword</Label>
                <Input id="monitor-keyword" placeholder="e.g. plumber" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monitor-grid-size">Grid size</Label>
                <Select
                  value={String(gridSize)}
                  onValueChange={(v) => {
                    setGridSize(Number(v) as (typeof GRID_SIZES)[number]);
                    setConfirmingRun(false);
                  }}
                >
                  <SelectTrigger id="monitor-grid-size" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRID_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}×{size} ({size * size} points)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monitor-radius">Radius (km)</Label>
                <Input id="monitor-radius" type="number" min="0.1" step="0.1" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monitor-auto-track">Track weekly</Label>
                <div className="flex h-9 items-center">
                  <Switch id="monitor-auto-track" checked={autoTrackEnabled} onCheckedChange={setAutoTrackEnabled} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button type="submit" variant="outline" disabled={!keyword.trim() || !(Number(radiusKm) > 0) || isSavingConfig}>
                {isSavingConfig ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save config
              </Button>
              <Button type="button" onClick={handleRunNow} disabled={!savedKeyword || configDirty || isScanning}>
                {isScanning ? <Loader2 className="size-3.5 animate-spin" /> : <MapPinned className="size-3.5" />}
                {confirmingRun ? "Confirm - run 49-point scan" : "Run now"}
              </Button>
              {confirmingRun ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmingRun(false)}>
                  Cancel
                </Button>
              ) : null}
              {configDirty ? <p className="text-xs text-muted-foreground">Save your changes before running.</p> : null}
            </div>
            {confirmingRun ? (
              <p className="text-xs text-muted-foreground">
                A 7×7 grid checks 49 real search positions in one scan - that&apos;s 49 live API calls and can take a
                little while. Click again to confirm.
              </p>
            ) : null}
            {configError ? <p className="text-sm text-destructive">{configError}</p> : null}
            {scanError ? <p className="text-sm text-destructive">{scanError}</p> : null}
          </form>
        </CardContent>
      </Card>

      {active ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Average position"
              value={active.avgPosition !== null ? active.avgPosition.toFixed(1) : "—"}
              deltaLabel={`Across ${active.points.length} grid points`}
              trend="up"
              icon={MapPinned}
            />
            <MetricCard
              label="% in top 3 (map pack)"
              value={`${active.pctInTop3.toFixed(0)}%`}
              deltaLabel={`For "${active.scan.keyword}"`}
              trend="up"
              icon={MapPinned}
              accent="primary"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MapPinned className="size-4 text-seo" />
                  Grid map
                </CardTitle>
                <CardDescription>Green = top 3, yellow = found outside top 3, red = not found.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={getGuidance} disabled={isGettingTip}>
                {isGettingTip ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Get guidance
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <GridMap center={{ lat: active.scan.centerLat, lng: active.scan.centerLng }} points={active.points} />
              {tip ? <div className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-line">{tip}</div> : null}
            </CardContent>
          </Card>
        </>
      ) : isLoadingScan ? (
        <StatGridSkeleton items={2} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Scan history</CardTitle>
          <CardDescription>Past geo-grid scans, including automatic weekly runs - click one to see its trend over time.</CardDescription>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <EmptyState icon={MapPinned} title="No scans yet" description="Save a keyword above, then run your first scan." />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border">
              {scans.map((scan) => (
                <li key={scan.id}>
                  <button
                    type="button"
                    onClick={() => loadScan(scan.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{scan.keyword}</span>
                    <span className="flex items-center gap-4 text-muted-foreground">
                      <span>
                        {scan.gridSize}×{scan.gridSize}
                      </span>
                      <span>{scan.avgPosition !== null ? `avg #${scan.avgPosition.toFixed(1)}` : "not found"}</span>
                      <span>{scan.pctInTop3.toFixed(0)}% top 3</span>
                      <span>{new Date(scan.createdAt).toLocaleDateString()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
