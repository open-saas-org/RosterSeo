"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddCompetitorForm({
  onAdd,
  disabled,
}: {
  /** Resolves to an error message on failure, or null on success. */
  onAdd: (domain: string) => Promise<string | null>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    const result = await onAdd(value);
    setSubmitting(false);

    if (result) {
      setError(result);
    } else {
      setValue("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex-1">
        <Label htmlFor={inputId} className="mb-1.5 text-xs font-medium text-muted-foreground">
          Competitor domain
        </Label>
        <Input
          id={inputId}
          placeholder="e.g. competitor.com"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled || submitting}
          aria-invalid={error ? true : undefined}
        />
        {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
      </div>
      <Button type="submit" disabled={disabled || submitting || !value.trim()}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Track competitor
      </Button>
    </form>
  );
}
