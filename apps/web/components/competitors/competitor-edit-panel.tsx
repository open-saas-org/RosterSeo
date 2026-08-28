"use client";

import { useState, type KeyboardEvent } from "react";
import { Loader2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";

// Compact inline add/remove chip list - same interaction shape as
// ai-visibility-prompts-workspace.tsx's TagEditor (type + Enter to add, X to
// remove a Badge), reused here for a competitor's aliases/additionalDomains.
function ChipList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((v) => (
        <Badge key={v} variant="outline" className="gap-1 pr-1 text-xs">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-sm text-muted-foreground hover:text-foreground">
            <X className="size-3" />
            <span className="sr-only">Remove {v}</span>
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        className="h-6 w-32 px-1.5 text-xs"
      />
    </div>
  );
}

// Real per-competitor profile editor: brand name, domain, aliases (alt
// names an AI might use instead), and additional domains (other domains
// this rival owns) - the same fields AI Visibility's matching and citation
// classification actually read (packages/ai-visibility/src/client.ts). One
// shared component so the Competitors page's detail view and any future
// caller edit through the identical PATCH contract instead of drifting.
export function CompetitorEditPanel({
  competitor,
  onSave,
  onCancel,
  isSaving,
}: {
  competitor: { domain: string; name: string | null; aliases: string[] | null; additionalDomains: string[] | null };
  onSave: (updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(competitor.name ?? "");
  const [domain, setDomain] = useState(competitor.domain);
  const [aliases, setAliases] = useState<string[]>(competitor.aliases ?? []);
  const [additionalDomains, setAdditionalDomains] = useState<string[]>(competitor.additionalDomains ?? []);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const normalizedDomain = normalizeDomain(domain);
    if (!isValidDomain(normalizedDomain)) {
      setError("Enter a valid domain, e.g. example.com");
      return;
    }
    setError(null);
    onSave({ name: name.trim(), domain: normalizedDomain, aliases, additionalDomains });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Brand name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Inc." className="h-8 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Domain</Label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Aliases</Label>
        <ChipList values={aliases} onChange={setAliases} placeholder="add an alias" />
        <p className="text-[11px] text-muted-foreground">Sub-brand or alternate names an AI might use instead of this competitor&apos;s name.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Additional domains</Label>
        <ChipList values={additionalDomains} onChange={setAdditionalDomains} placeholder="add a domain" />
        <p className="text-[11px] text-muted-foreground">Other domains this competitor owns - citations from these count as theirs in Citations.</p>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
