"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OpenRouterModel = {
  id: string;
  name: string;
  contextLength: number;
  promptPriceUsdPerM: number | null;
  completionPriceUsdPerM: number | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatPrice(model: OpenRouterModel): string {
  if (model.promptPriceUsdPerM === null || model.completionPriceUsdPerM === null) return "pricing unavailable";
  if (model.promptPriceUsdPerM === 0 && model.completionPriceUsdPerM === 0) return "free";
  return `$${model.promptPriceUsdPerM.toFixed(2)} in / $${model.completionPriceUsdPerM.toFixed(2)} out per M tokens`;
}

const MAX_RESULTS = 30;

// A real, searchable picker over OpenRouter's actual model catalog (417
// real models as of this writing - see listOpenRouterModels) instead of a
// free-text field that only works if you already know the exact slug.
// Still lets you type/keep an arbitrary slug (the input IS the value,
// updated on every keystroke) - picking a result from the dropdown is a
// shortcut that fills in the exact real id, not the only way to set it.
export function OpenRouterModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useSWR<{ models: OpenRouterModel[] }>("/api/ai-visibility/openrouter-models", fetcher);
  const [isOpen, setIsOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const models = data?.models ?? [];
  const selected = useMemo(() => models.find((m) => m.id === value), [models, value]);

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return models.slice(0, MAX_RESULTS);
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [models, value]);

  function handleSelect(model: OpenRouterModel) {
    onChange(model.id);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay so a click on a dropdown row registers before the
            // dropdown unmounts (blur fires first).
            blurTimeout.current = setTimeout(() => setIsOpen(false), 150);
          }}
          placeholder="Search real OpenRouter models…"
          disabled={disabled}
          className="w-72 pr-7"
        />
        {isLoading ? (
          <Loader2 className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {selected ? <p className="mt-1 text-[11px] text-muted-foreground">{formatPrice(selected)}</p> : null}

      {isOpen && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-72 w-[26rem] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{isLoading ? "Loading real model list…" : "No matching models."}</p>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  handleSelect(m);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60",
                  m.id === value && "bg-muted/40",
                )}
              >
                <span className="flex w-full items-center gap-1.5 font-medium">
                  {m.id === value ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {m.id} · {formatPrice(m)}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
