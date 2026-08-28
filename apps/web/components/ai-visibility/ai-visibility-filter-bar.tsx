"use client";

import { ChevronDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 0 is the "all time" sentinel - every dashboard's own cutoff/windowing
// logic must treat days === 0 as "no cutoff" rather than a literal 0-day
// window. A wider lookback range (1w/1m/3m/6m/1y/all) - we didn't have
// anything past 90 days before.
export const AI_VISIBILITY_DAY_OPTIONS = [7, 30, 90, 180, 365, 0] as const;

export const DAY_OPTION_LABELS: Record<number, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
  180: "Last 6 months",
  365: "Last 12 months",
  0: "All time",
};

// The model/tags/day-window toolbar shared by every AI Visibility dashboard
// (Visibility, Share of Voice, Citations, Query Fan-Out) - was copy-pasted
// identically 4 times; consolidated here so it looks and behaves the same
// everywhere, and any future polish lands in one place. Rounded pill
// triggers with a leading icon and the full resolved label (never a bare
// code/number) - the shared style every other page's filter bar matches.
export function AiVisibilityFilterBar({
  model,
  onModelChange,
  modelOptions,
  selectedTags,
  onToggleTag,
  allTags,
  days,
  onDaysChange,
}: {
  model: string;
  onModelChange: (v: string) => void;
  modelOptions: Array<{ value: string; label: string }>;
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  allTags: string[];
  days: number;
  onDaysChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterSelect
        value={model}
        onValueChange={(v) => onModelChange(v)}
        options={[{ value: "all", label: "All models" }, ...modelOptions]}
        triggerClassName="w-44"
      />

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="h-9 gap-2 rounded-[10px] border-border px-3.5 font-medium shadow-none hover:bg-muted/40" />}>
          <Tag className="size-4 text-muted-foreground" />
          Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ""}
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Filter by tag</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {allTags.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">No tags yet - add some on the Prompts page.</p>
          ) : (
            allTags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={selectedTags.has(tag)}
                onCheckedChange={() => onToggleTag(tag)}
                onSelect={(e) => e.preventDefault()}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <FilterSelect
        value={String(days)}
        onValueChange={(v) => onDaysChange(Number(v))}
        options={AI_VISIBILITY_DAY_OPTIONS.map((d) => ({ value: String(d), label: DAY_OPTION_LABELS[d]! }))}
        triggerClassName="w-44"
      />
    </div>
  );
}
