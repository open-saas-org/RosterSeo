"use client";

import { useMemo, useState } from "react";
import { Check, Download, Filter, ListChecks, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { KeywordDifficulty } from "@/components/keywords/keyword-difficulty";
import { IntentBadge } from "@/components/keywords/intent-badge";
import { isQuestionKeyword } from "@/components/keywords/question-classifier";
import type { KeywordResultSource, SourcedKeywordMetrics } from "@/components/keywords/keyword-research-types";

const columnHelper = createDataTableColumns<SourcedKeywordMetrics>();

// Still used for CSV export (every row's source is worth keeping in the
// download even though the table itself now conveys it via which tab a
// row appears in, not a column).
const SOURCE_LABELS: Record<KeywordResultSource, string> = {
  related: "Related",
  suggestion: "Variation",
  idea: "Idea",
};

type Filters = {
  keyword: string;
  minVolume: string;
  minCpc: string;
  maxCpc: string;
  minDifficulty: string;
  maxDifficulty: string;
};

const EMPTY_FILTERS: Filters = {
  keyword: "",
  minVolume: "",
  minCpc: "",
  maxCpc: "",
  minDifficulty: "",
  maxDifficulty: "",
};

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

// DataTable has no controlled row-selection or row-click support - both
// are hand-rolled here (Set<string> selection, a clickable Keyword cell)
// rather than extending the shared component's API, same low-footprint
// approach Rank Tracking's table already established for the selection
// case.
export function KeywordResearchTable({
  results,
  trackedKeys,
  onTrack,
  onSelectKeyword,
  selectedKeyword,
}: {
  results: SourcedKeywordMetrics[];
  trackedKeys: Set<string>;
  onTrack: (keywords: string[]) => void;
  onSelectKeyword: (keyword: string) => void;
  selectedKeyword: string | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const filtered = useMemo(() => {
    const keywordQuery = filters.keyword.trim().toLowerCase();
    const minVolume = filters.minVolume ? Number(filters.minVolume) : null;
    const minCpc = filters.minCpc ? Number(filters.minCpc) : null;
    const maxCpc = filters.maxCpc ? Number(filters.maxCpc) : null;
    const minDifficulty = filters.minDifficulty ? Number(filters.minDifficulty) : null;
    const maxDifficulty = filters.maxDifficulty ? Number(filters.maxDifficulty) : null;

    return results.filter((row) => {
      if (keywordQuery && !row.keyword.toLowerCase().includes(keywordQuery)) return false;
      if (minVolume !== null && row.searchVolume < minVolume) return false;
      if (minCpc !== null && row.cpc < minCpc) return false;
      if (maxCpc !== null && row.cpc > maxCpc) return false;
      if (minDifficulty !== null && row.difficulty < minDifficulty) return false;
      if (maxDifficulty !== null && row.difficulty > maxDifficulty) return false;
      return true;
    });
  }, [results, filters]);

  // Three lenses over the same filtered set, not a strict partition - a
  // question-format keyword that's also a close "related" match legitimately
  // shows up under both Similar and Questions, same as tabs in most
  // research tools aren't mutually exclusive buckets.
  const similarRows = useMemo(() => filtered.filter((r) => r.source === "related"), [filtered]);
  const suggestedRows = useMemo(() => filtered.filter((r) => r.source === "suggestion" || r.source === "idea"), [filtered]);
  const questionRows = useMemo(() => filtered.filter((r) => isQuestionKeyword(r.keyword)), [filtered]);

  function toggleSelectAllIn(rows: SourcedKeywordMetrics[]) {
    const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.keyword));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const row of rows) next.delete(row.keyword);
      } else {
        for (const row of rows) next.add(row.keyword);
      }
      return next;
    });
  }

  function toggleSelectRow(keyword: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  function handleExport() {
    downloadCsv("keyword-research.csv", [
      ["Keyword", "Source", "Volume", "CPC", "Competition", "Difficulty", "Intent"],
      ...filtered.map((row) => [
        row.keyword,
        SOURCE_LABELS[row.source],
        row.searchVolume,
        row.cpc,
        row.competition ?? "unknown",
        row.difficulty,
        row.intent ?? "",
      ]),
    ]);
  }

  function makeColumns(rows: SourcedKeywordMetrics[]): DataTableColumnDef<SourcedKeywordMetrics>[] {
    const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.keyword));
    return [
      columnHelper.display({
        id: "select",
        header: () => (
          <Checkbox checked={allSelected} onCheckedChange={() => toggleSelectAllIn(rows)} aria-label="Select all rows" />
        ),
        cell: (info) => (
          <Checkbox
            checked={selectedIds.has(info.row.original.keyword)}
            onCheckedChange={() => toggleSelectRow(info.row.original.keyword)}
            aria-label={`Select ${info.row.original.keyword}`}
          />
        ),
      }),
      columnHelper.accessor("keyword", {
        header: "Keyword",
        cell: (info) => {
          const keyword = info.getValue();
          const isSelected = selectedKeyword === keyword;
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectKeyword(keyword)}
                className={`truncate text-left text-sm hover:underline ${isSelected ? "text-primary underline" : ""}`}
              >
                {keyword}
              </button>
              {isQuestionKeyword(keyword) ? (
                <Badge variant="outline" className="text-[10px]">
                  ?
                </Badge>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("searchVolume", {
        header: "Volume",
        cell: (info) => <span className="text-xs tabular-nums">{info.getValue().toLocaleString()}</span>,
      }),
      columnHelper.accessor("cpc", {
        header: "CPC",
        cell: (info) => <span className="text-xs tabular-nums">${info.getValue().toFixed(2)}</span>,
      }),
      columnHelper.accessor("competition", {
        header: "Comp.",
        cell: (info) => {
          const value = info.getValue();
          return <span className="text-xs tabular-nums text-muted-foreground">{value === null ? "—" : value.toFixed(2)}</span>;
        },
      }),
      columnHelper.accessor("difficulty", {
        header: "Score",
        cell: (info) => <KeywordDifficulty score={info.getValue()} />,
      }),
      columnHelper.accessor("intent", {
        header: "Intent",
        cell: (info) => <IntentBadge intent={info.getValue()} />,
      }),
      columnHelper.display({
        id: "action",
        header: "",
        cell: (info) => {
          const keyword = info.row.original.keyword;
          const tracked = trackedKeys.has(keyword.toLowerCase());
          return (
            <div className="flex justify-end">
              <Button variant={tracked ? "secondary" : "outline"} size="xs" disabled={tracked} onClick={() => onTrack([keyword])}>
                {tracked ? (
                  <>
                    <Check /> Tracked
                  </>
                ) : (
                  <>
                    <Plus /> Track
                  </>
                )}
              </Button>
            </div>
          );
        },
      }),
    ];
  }

  const similarColumns = useMemo(() => makeColumns(similarRows), [similarRows, selectedIds, selectedKeyword, trackedKeys, onTrack, onSelectKeyword]);
  const suggestedColumns = useMemo(() => makeColumns(suggestedRows), [suggestedRows, selectedIds, selectedKeyword, trackedKeys, onTrack, onSelectKeyword]);
  const questionColumns = useMemo(() => makeColumns(questionRows), [questionRows, selectedIds, selectedKeyword, trackedKeys, onTrack, onSelectKeyword]);

  const selectedCount = selectedIds.size;

  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm">
      {results.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No results"
          description="Search a seed keyword to see similar keywords, variations, and questions here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Tabs defaultValue="similar">
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-3 py-2">
              <TabsList variant="line">
                <TabsTrigger value="similar">Similar ({similarRows.length})</TabsTrigger>
                <TabsTrigger value="suggested">Suggested ({suggestedRows.length})</TabsTrigger>
                <TabsTrigger value="questions">Questions ({questionRows.length})</TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
                <Filter className="size-4" /> Filters
              </Button>

              <div className="ml-auto flex items-center gap-2">
                {selectedCount > 0 ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      onTrack(Array.from(selectedIds));
                      setSelectedIds(new Set());
                    }}
                  >
                    <Plus className="size-4" /> Track selected ({selectedCount})
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                  <Download className="size-4" /> Export
                </Button>
              </div>
            </div>

            {showFilters ? (
              <div className="grid gap-4 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-filter-keyword">Keyword contains</Label>
                  <Input
                    id="kw-filter-keyword"
                    value={filters.keyword}
                    onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                    placeholder="near me"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-filter-min-vol">Volume min</Label>
                  <Input
                    id="kw-filter-min-vol"
                    type="number"
                    value={filters.minVolume}
                    onChange={(e) => setFilters((f) => ({ ...f, minVolume: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-filter-cpc">CPC range</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="kw-filter-cpc"
                      type="number"
                      step="0.01"
                      value={filters.minCpc}
                      onChange={(e) => setFilters((f) => ({ ...f, minCpc: e.target.value }))}
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={filters.maxCpc}
                      onChange={(e) => setFilters((f) => ({ ...f, maxCpc: e.target.value }))}
                      placeholder="Max"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kw-filter-difficulty">Difficulty range</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="kw-filter-difficulty"
                      type="number"
                      value={filters.minDifficulty}
                      onChange={(e) => setFilters((f) => ({ ...f, minDifficulty: e.target.value }))}
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      value={filters.maxDifficulty}
                      onChange={(e) => setFilters((f) => ({ ...f, maxDifficulty: e.target.value }))}
                      placeholder="Max"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <TabsContent value="similar" className="min-w-0">
                <DataTable columns={similarColumns} data={similarRows} pageSize={20} emptyMessage="No similar keywords match these filters." bordered={false} />
              </TabsContent>
              <TabsContent value="suggested" className="min-w-0">
                <DataTable columns={suggestedColumns} data={suggestedRows} pageSize={20} emptyMessage="No suggested keywords match these filters." bordered={false} />
              </TabsContent>
              <TabsContent value="questions" className="min-w-0">
                <DataTable columns={questionColumns} data={questionRows} pageSize={20} emptyMessage="No question keywords match these filters." bordered={false} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
