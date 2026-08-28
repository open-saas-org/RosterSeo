"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2, ListTree, X, ListPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { cn } from "@/lib/utils";
import { isBrandedPrompt } from "@seo-tool/ai-visibility";

type TrackedPrompt = {
  id: string;
  promptText: string;
  tags: string[] | null;
  enabled: boolean;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const columnHelper = createDataTableColumns<TrackedPrompt>();

// Kept in sync with MAX_PROMPTS (apps/web/lib/ai-visibility/track-prompt.ts,
// enforced server-side in both the single-add and bulk-import routes). Not
// imported directly - that module pulls in @seo-tool/db, which isn't safe
// to bundle into a client component.
const MAX_PROMPTS = 100;

// Shared datalist id every TagEditor's <input list=...> points at, so the
// browser's native autocomplete suggests tag names already used elsewhere
// in this project (typo-driven tag sprawl is the thing this is meant to
// avoid) without pulling in a combobox dependency the codebase doesn't
// otherwise have (checked components/publish/publish-composer.tsx - its
// tags field is plain comma-separated text with no reuse either).
const TAG_DATALIST_ID = "ai-visibility-tag-suggestions";

function TagEditor({
  promptId,
  tags,
  onChange,
}: {
  promptId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  function commit() {
    const tag = value.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setValue("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="rounded-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            <span className="sr-only">Remove tag {tag}</span>
          </button>
        </Badge>
      ))}
      {adding ? (
        <Input
          autoFocus
          list={TAG_DATALIST_ID}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setValue("");
              setAdding(false);
            }
          }}
          placeholder="tag"
          className="h-6 w-24 px-1.5 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
          aria-label={`Add tag to prompt ${promptId}`}
        >
          + tag
        </button>
      )}
    </div>
  );
}

export function AiVisibilityPromptsWorkspace({
  projectId,
  brandName,
  brandDomain,
}: {
  projectId: string;
  brandName: string;
  brandDomain: string;
}) {
  const { data, isLoading, mutate } = useSWR<{ prompts: TrackedPrompt[] }>(
    `/api/projects/${projectId}/ai-visibility`,
    fetcher,
  );
  const [newPrompt, setNewPrompt] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [bulkReport, setBulkReport] = useState<string | null>(null);

  const prompts = data?.prompts ?? [];
  const atCap = prompts.length >= MAX_PROMPTS;

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const p of prompts) for (const t of p.tags ?? []) seen.add(t);
    return [...seen].sort();
  }, [prompts]);

  async function patchPrompt(id: string, updates: { tags?: string[]; enabled?: boolean }) {
    // Optimistic - the Prompts table should feel instant for tag/toggle edits.
    mutate(
      (current) =>
        current && {
          prompts: current.prompts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        },
      { revalidate: false },
    );
    const res = await fetch(`/api/projects/${projectId}/ai-visibility/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      setError("Couldn't save that change. Try again.");
      mutate();
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const text = newPrompt.trim();
    if (!text) return;
    if (atCap) {
      setError(`This project is at its limit of ${MAX_PROMPTS} prompts. Remove one before adding another.`);
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText: text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't add that prompt.");
      setNewPrompt("");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that prompt.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleBulkAdd() {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;
    setIsBulkAdding(true);
    setError(null);
    setBulkReport(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/prompts/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: lines }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't add those prompts.");

      const { added, skipped } = body as { added: number; skipped: Array<{ text: string; reason: "empty" | "duplicate" | "cap" }> };
      const emptyCount = skipped.filter((s) => s.reason === "empty").length;
      const duplicateCount = skipped.filter((s) => s.reason === "duplicate").length;
      const capCount = skipped.filter((s) => s.reason === "cap").length;

      const parts: string[] = [`Added ${added} prompt${added === 1 ? "" : "s"}.`];
      if (duplicateCount > 0) parts.push(`${duplicateCount} already tracked or repeated in your list, skipped.`);
      if (emptyCount > 0) parts.push(`${emptyCount} blank line${emptyCount === 1 ? "" : "s"} skipped.`);
      if (capCount > 0) parts.push(`${capCount} skipped - would exceed the ${MAX_PROMPTS}-prompt limit.`);
      setBulkReport(parts.join(" "));

      setBulkText("");
      if (skipped.length === 0) setBulkOpen(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add those prompts.");
    } finally {
      setIsBulkAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/ai-visibility/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      mutate();
    } else {
      setError("Couldn't remove that prompt. Try again.");
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setError(null);
    const ids = [...selected];
    await Promise.all(ids.map((id) => fetch(`/api/projects/${projectId}/ai-visibility/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    mutate();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = prompts.length > 0 && prompts.every((p) => selected.has(p.id));

  const columns: DataTableColumnDef<TrackedPrompt>[] = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => setSelected(checked ? new Set(prompts.map((p) => p.id)) : new Set())}
            aria-label="Select all prompts"
          />
        ),
        cell: (info) => (
          <Checkbox
            checked={selected.has(info.row.original.id)}
            onCheckedChange={() => toggleSelected(info.row.original.id)}
            aria-label={`Select prompt ${info.row.original.promptText}`}
          />
        ),
      }),
      columnHelper.accessor("promptText", {
        header: "Prompt Text",
        cell: (info) => <span className="block max-w-md truncate">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "system",
        header: "System",
        cell: (info) => (
          <Badge variant="outline" className="text-muted-foreground">
            {isBrandedPrompt(info.row.original.promptText, brandName, brandDomain) ? "branded" : "unbranded"}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: "tags",
        header: "Tags",
        cell: (info) => (
          <TagEditor
            promptId={info.row.original.id}
            tags={info.row.original.tags ?? []}
            onChange={(tags) => patchPrompt(info.row.original.id, { tags })}
          />
        ),
      }),
      columnHelper.display({
        id: "enabled",
        header: () => <span className="block text-right">Enabled</span>,
        cell: (info) => (
          <div className="flex justify-end">
            <Switch
              checked={info.row.original.enabled}
              onCheckedChange={(enabled) => patchPrompt(info.row.original.id, { enabled })}
            />
          </div>
        ),
      }),
      columnHelper.display({
        id: "action",
        header: "",
        cell: (info) => (
          <div className="flex justify-end">
            <IconButton
              icon={Trash2}
              label="Remove"
              onClick={() => handleRemove(info.row.original.id)}
              className="hover:text-destructive"
            />
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prompts, selected, allSelected, brandName, brandDomain],
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <datalist id={TAG_DATALIST_ID}>
        {allTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <form onSubmit={handleAdd} className="flex flex-1 items-end gap-4">
          <Input
            placeholder={atCap ? `Limit of ${MAX_PROMPTS} prompts reached` : "best project management software for startups"}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            disabled={atCap}
          />
          <Button type="submit" disabled={!newPrompt.trim() || isAdding || atCap}>
            {isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add Prompt
          </Button>
          <Button type="button" variant="outline" onClick={() => setBulkOpen((v) => !v)} disabled={atCap}>
            <ListPlus className="size-4" />
            Add Multiple
          </Button>
        </form>
        {selected.size > 0 ? (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1.5">
            <Trash2 className="size-3.5" />
            Delete {selected.size}
          </Button>
        ) : null}
      </div>

      {atCap ? (
        <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          This project is tracking {prompts.length}/{MAX_PROMPTS} prompts, its limit. Remove a prompt below to free up room for a new one.
        </p>
      ) : null}

      {bulkOpen ? (
        <div className="flex flex-col gap-2 border-b p-4">
          <Textarea
            placeholder={"One prompt per line, e.g.\nbest AEO tool for e-commerce brands\nAEO vs SEO - what's the difference?"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleBulkAdd} disabled={!bulkText.trim() || isBulkAdding}>
              {isBulkAdding ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Add {bulkText.split("\n").filter((l) => l.trim()).length || ""} prompts
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
          </div>
          {bulkReport ? <p className="text-xs text-muted-foreground">{bulkReport}</p> : null}
        </div>
      ) : null}

      {error ? <p className="border-b px-4 py-2 text-sm text-destructive">{error}</p> : null}

      {isLoading ? (
        <div className="p-4">
          <ListSkeleton rows={4} />
        </div>
      ) : prompts.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={ListTree} title="No prompts tracked yet" description="Add one above to get started." />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={prompts}
            pageSize={20}
            emptyMessage="No prompts tracked yet."
            emptyIcon={ListTree}
            getRowClassName={(prompt) => cn(!prompt.enabled && "opacity-50")}
            bordered={false}
          />
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            {prompts.length}/{MAX_PROMPTS} prompts configured
          </p>
        </>
      )}
    </div>
  );
}
