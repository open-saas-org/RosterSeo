"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// The one filter-trigger shape every page should use: a rounded pill with
// the resolved label (never a bare code/number - see each page's option
// list) and the built-in chevron. Consolidated here so "make every filter
// look the same" is one shared component to get right, not N pages
// independently reinventing (and drifting from) the same className string.
export function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    // `items` is what makes the trigger show the real label instead of the
    // raw value - Base UI's <Select.Value> only resolves a label by
    // matching against this data structure (see its own docs: "When
    // specified, <Select.Value> renders the label of the selected item
    // instead of the raw value"). Without it, the trigger falls back to
    // printing the bare value string on first render - exactly the "shows
    // 28 instead of Last 28 days" bug, since the popup's own <SelectItem>s
    // haven't mounted yet to register their labels the lazy way.
    <Select value={value} onValueChange={(v) => v && onValueChange(v)} items={options}>
      <SelectTrigger
        className={cn(
          // Same radius as Card (components/ui/card.tsx) - a filter pill
          // sits in the same visual language as the cards/tables it
          // filters, not a fully round pill-shaped chip.
          "h-9 gap-2 rounded-[10px] border-border bg-background px-3.5 text-sm font-medium shadow-none hover:bg-muted/40",
          triggerClassName,
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
