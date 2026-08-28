"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, Filter, ListChecks, Loader2, RefreshCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { KeywordDifficulty } from "@/components/keywords/keyword-difficulty";
import { PositionDelta } from "@/components/keywords/position-delta";
import type { RankCheckRunProgress, TrackedKeyword } from "@/components/keywords/rank-tracking-types";

const columnHelper = createDataTableColumns<TrackedKeyword>();

type SingleCheckResult = { position: number | null; url: string | null; checkedAt: string; serpFeatures: string[]; isMock: boolean };

type Filters = {
  keyword: string;
  minPosition: string;
  maxPosition: string;
  minVolume: string;
  minKd: string;
  maxKd: string;
};

const EMPTY_FILTERS: Filters = { keyword: "", minPosition: "", maxPosition: "", minVolume: "", minKd: "", maxKd: "" };

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

// DataTable has no controlled row-selection support (it owns its own
// useTable instance internally), so bulk-select is a plain Set<string>
// hand-rolled here in the parent - the same reason a header checkbox
// selects/clears the whole filtered set rather than trying to reach into
// DataTable's pagination state.
export function RankTrackingTable({
  projectId,
  tracked,
  onUntrack,
  onBulkUntrack,
  onCheckedKeyword,
  onFetchRankings,
  runProgress,
}: {
  projectId: string;
  tracked: TrackedKeyword[];
  onUntrack: (id: string) => void;
  onBulkUntrack: (ids: string[]) => void;
  onCheckedKeyword: (id: string, result: SingleCheckResult) => void;
  onFetchRankings: (keywordIds?: string[]) => void;
  runProgress: RankCheckRunProgress | null;
}) {
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const isRunActive = runProgress !== null && (runProgress.status === "pending" || runProgress.status === "running");

  async function handleCheckRank(id: string) {
    setCheckingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/projects/${projectId}/keywords/${id}/rankings`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error();
      const ranking = data.ranking as { position: number | null; url: string | null; checkedAt: string; serpFeatures: string[] | null; isMock: boolean };
      onCheckedKeyword(id, {
        position: ranking.position,
        url: ranking.url,
        checkedAt: ranking.checkedAt,
        serpFeatures: ranking.serpFeatures ?? [],
        isMock: ranking.isMock,
      });
    } catch {
      // Swallowed intentionally - the row simply doesn't update; the user
      // can retry the same icon button.
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const filtered = useMemo(() => {
    const keywordQuery = filters.keyword.trim().toLowerCase();
    const minPosition = filters.minPosition ? Number(filters.minPosition) : null;
    const maxPosition = filters.maxPosition ? Number(filters.maxPosition) : null;
    const minVolume = filters.minVolume ? Number(filters.minVolume) : null;
    const minKd = filters.minKd ? Number(filters.minKd) : null;
    const maxKd = filters.maxKd ? Number(filters.maxKd) : null;

    return tracked.filter((row) => {
      if (keywordQuery && !row.keyword.toLowerCase().includes(keywordQuery)) return false;
      if (minPosition !== null && (row.currentPosition === null || row.currentPosition < minPosition)) return false;
      if (maxPosition !== null && (row.currentPosition === null || row.currentPosition > maxPosition)) return false;
      if (minVolume !== null && (row.searchVolume === null || row.searchVolume < minVolume)) return false;
      if (minKd !== null && (row.keywordDifficulty === null || row.keywordDifficulty < minKd)) return false;
      if (maxKd !== null && (row.keywordDifficulty === null || row.keywordDifficulty > maxKd)) return false;
      return true;
    });
  }, [tracked, filters]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      for (const row of filtered) next.add(row.id);
      return next;
    });
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    downloadCsv("rank-tracking.csv", [
      ["Keyword", "Position", "URL", "Volume", "Difficulty", "CPC", "SERP Features", "Last checked"],
      ...filtered.map((row) => [
        row.keyword,
        row.currentPosition ?? "",
        row.currentUrl ?? "",
        row.searchVolume ?? "",
        row.keywordDifficulty ?? "",
        row.cpc ?? "",
        row.serpFeatures.join("; "),
        row.checkedAt ?? "",
      ]),
    ]);
  }

  const columns = useMemo<DataTableColumnDef<TrackedKeyword>[]>(
    () => [
      columnHelper.display({
        id: "select",
        header: () => (
          <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} aria-label="Select all rows" />
        ),
        cell: (info) => (
          <Checkbox
            checked={selectedIds.has(info.row.original.id)}
            onCheckedChange={() => toggleSelectRow(info.row.original.id)}
            aria-label={`Select ${info.row.original.keyword}`}
          />
        ),
      }),
      columnHelper.accessor("keyword", {
        header: "Keyword",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor((row) => row.currentPosition ?? 9999, {
        id: "position",
        header: "Position",
        cell: (info) => (
          <div className="flex items-center gap-1.5">
            <PositionDelta current={info.row.original.currentPosition} previous={info.row.original.previousPosition} />
            {info.row.original.isMock ? (
              <Badge variant="outline" title="DataForSEO was unavailable when this was last checked - this is demo data, not a real position.">
                Demo data
              </Badge>
            ) : null}
          </div>
        ),
      }),
      columnHelper.display({
        id: "url",
        header: "URL",
        cell: (info) => {
          const url = info.row.original.currentUrl;
          if (!url) return <span className="text-muted-foreground">—</span>;
          const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
          return (
            <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <span className="max-w-[180px] truncate">{path}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          );
        },
      }),
      columnHelper.accessor("searchVolume", {
        header: "Volume",
        cell: (info) => {
          const v = info.getValue();
          return <span className="tabular-nums">{v === null ? "—" : v.toLocaleString()}</span>;
        },
      }),
      columnHelper.accessor("keywordDifficulty", {
        header: "KD",
        cell: (info) => <KeywordDifficulty score={info.getValue()} />,
      }),
      columnHelper.accessor("cpc", {
        header: "CPC",
        cell: (info) => {
          const v = info.getValue();
          return <span className="tabular-nums text-muted-foreground">{v === null ? "—" : `$${v.toFixed(2)}`}</span>;
        },
      }),
      columnHelper.display({
        id: "serpFeatures",
        header: "SERP Features",
        cell: (info) => {
          const features = info.row.original.serpFeatures;
          if (features.length === 0) return <span className="text-muted-foreground">—</span>;
          const shown = features.slice(0, 2);
          const rest = features.length - shown.length;
          return (
            <div className="flex flex-wrap gap-1">
              {shown.map((f) => (
                <Badge key={f} variant="outline">
                  {f}
                </Badge>
              ))}
              {rest > 0 ? <Badge variant="outline">+{rest}</Badge> : null}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "action",
        header: "",
        cell: (info) => {
          const id = info.row.original.id;
          const isChecking = checkingIds.has(id);
          return (
            <div className="flex justify-end gap-1">
              <IconButton
                icon={RefreshCcw}
                label="Check rank now"
                onClick={() => handleCheckRank(id)}
                disabled={isChecking}
                className={isChecking ? "[&_svg]:animate-spin" : undefined}
              />
              <IconButton icon={X} label="Untrack" onClick={() => onUntrack(id)} />
            </div>
          );
        },
      }),
    ],
    [checkingIds, selectedIds, allFilteredSelected, filtered, onUntrack],
  );

  const selectedCount = selectedIds.size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="size-4" /> Filters
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {isRunActive ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="size-4 animate-spin" />
              Checking {runProgress!.keywordsChecked}/{runProgress!.keywordsTotal}…
            </Button>
          ) : selectedCount > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onBulkUntrack(Array.from(selectedIds))}>
                Remove selected ({selectedCount})
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onFetchRankings(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }}
              >
                Fetch Rankings ({selectedCount})
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => onFetchRankings(undefined)} disabled={tracked.length === 0}>
              Fetch Rankings
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="size-4" /> Export
          </Button>
        </div>
      </div>

      {showFilters ? (
        <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-filter-keyword">Keyword contains</Label>
            <Input
              id="rt-filter-keyword"
              value={filters.keyword}
              onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
              placeholder="shoes"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-filter-min-pos">Position min</Label>
            <Input
              id="rt-filter-min-pos"
              type="number"
              value={filters.minPosition}
              onChange={(e) => setFilters((f) => ({ ...f, minPosition: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-filter-max-pos">Position max</Label>
            <Input
              id="rt-filter-max-pos"
              type="number"
              value={filters.maxPosition}
              onChange={(e) => setFilters((f) => ({ ...f, maxPosition: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-filter-min-vol">Volume min</Label>
            <Input
              id="rt-filter-min-vol"
              type="number"
              value={filters.minVolume}
              onChange={(e) => setFilters((f) => ({ ...f, minVolume: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rt-filter-kd">KD range</Label>
            <div className="flex items-center gap-1">
              <Input
                id="rt-filter-kd"
                type="number"
                value={filters.minKd}
                onChange={(e) => setFilters((f) => ({ ...f, minKd: e.target.value }))}
                placeholder="Min"
              />
              <Input
                type="number"
                value={filters.maxKd}
                onChange={(e) => setFilters((f) => ({ ...f, maxKd: e.target.value }))}
                placeholder="Max"
              />
            </div>
          </div>
          <div className="sm:col-span-3 lg:col-span-5">
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}

      {tracked.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No tracked keywords yet"
          description="Add keywords, then run Fetch Rankings to check their position."
        />
      ) : (
        <DataTable columns={columns} data={filtered} pageSize={20} emptyMessage="No keywords match these filters." />
      )}
    </div>
  );
}
