"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Chip-style add/remove list for a string[] field - same interaction shape
// as ai-visibility-prompts-workspace.tsx's TagEditor (type + Enter to add, X
// to remove), just standalone rather than embedded in a table cell.
function ChipListField({
  label,
  helpText,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  helpText: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(e?: FormEvent) {
    e?.preventDefault();
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <form onSubmit={commit} className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
        {values.map((v) => (
          <Badge key={v} variant="outline" className="gap-1 pr-1">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              <span className="sr-only">Remove {v}</span>
            </button>
          </Badge>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e);
          }}
          placeholder={placeholder}
          className="h-6 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
        <button type="submit" className="sr-only">
          Add
        </button>
      </form>
      <p className="text-xs text-muted-foreground">{helpText}</p>
    </div>
  );
}

export function BrandSettingsWorkspace({
  projectId,
  name,
  domain,
  initialContext,
  initialAliases,
  initialAdditionalDomains,
}: {
  projectId: string;
  name: string;
  domain: string;
  initialContext: string;
  initialAliases: string[];
  initialAdditionalDomains: string[];
}) {
  const [context, setContext] = useState(initialContext);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [additionalDomains, setAdditionalDomains] = useState<string[]>(initialAdditionalDomains);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/brand`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, aliases, additionalDomains }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand identity</CardTitle>
        <CardDescription>Real project identity, plus context fed into every AI Visibility LLM prompt.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Project name</Label>
            <Input value={name} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Domain</Label>
            <Input value={domain} disabled />
          </div>
        </div>

        <ChipListField
          label="Alternate names / aliases"
          helpText="Alternate or sub-brand names an AI might use instead of your brand name (e.g. an abbreviation or product line name) - used to catch mentions that don't say your exact project name."
          placeholder="add an alias, press Enter"
          values={aliases}
          onChange={setAliases}
        />

        <ChipListField
          label="Additional domains"
          helpText="Other domains you own (blog, regional site, docs subdomain) - citations from these count as your own brand instead of falling into Citations' 'Other' bucket."
          placeholder="add a domain, press Enter"
          values={additionalDomains}
          onChange={setAdditionalDomains}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-visibility-context">Additional context for AI sampling</Label>
          <Textarea
            id="ai-visibility-context"
            rows={4}
            placeholder="e.g. we're a project-management SaaS for small agencies, our closest competitors are X and Y, we're known for..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Used in Query Fan-Out and Opportunities&apos; LLM prompts to make results sharper - not sent on every
            visibility sample (those only use the project name and domain).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving} className="w-fit">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
            {saved ? "Saved" : "Save"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
