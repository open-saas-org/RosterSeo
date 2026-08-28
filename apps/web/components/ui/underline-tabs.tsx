import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// A lighter-weight tab strip than the shadcn `Tabs` pill (components/ui/tabs.tsx)
// - used for in-card filter tabs (category/page-type/change-type pickers)
// rather than top-level page navigation. Was duplicated ad hoc per file;
// consolidated here so every instance gets the same look and any future
// polish lands everywhere at once.
export function UnderlineTabs<T extends string>({
  tabs,
  active,
  onSelect,
  className,
}: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onSelect: (k: T) => void;
  className?: string;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onSelect(tabs[next].key);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }

  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1 border-b px-2", className)}>
      {tabs.map((t, i) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          tabIndex={active === t.key ? 0 : -1}
          onClick={() => onSelect(t.key)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className={cn(
            "rounded-t-md border-b-2 px-2 py-2 text-sm font-medium transition-colors",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
