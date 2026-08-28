"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Add-keywords flow for the rebuilt Rank Tracking page: single input (comma
// separated) plus a newline-per-keyword bulk textarea, modeled on
// IndexNowSubmitAction's textarea pattern. Both paths POST the same bulk
// { keywords: string[] } body - this only ever saves rows to
// tracked_keywords, it never calls DataForSEO (that's Fetch Rankings' job).
export function AddKeywordsDialog({
  projectId,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSingle("");
      setBulk("");
      setError(null);
      setResult(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    const keywords = [...single.split(","), ...bulk.split("\n")].map((k) => k.trim()).filter(Boolean);

    if (keywords.length === 0) {
      setError("Enter at least one keyword.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add keywords.");
      setSingle("");
      setBulk("");
      setResult(
        `Added ${data.added} keyword${data.added === 1 ? "" : "s"}${data.skipped > 0 ? ` (${data.skipped} already tracked)` : ""}.`,
      );
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add keywords.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add keywords</DialogTitle>
          <DialogDescription>
            Adding a keyword only saves it to your tracked list - it won&apos;t check its ranking until you run
            Fetch Rankings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-keywords-single">Keywords</Label>
            <Input
              id="add-keywords-single"
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              placeholder="running shoes, best trail shoes"
            />
            <p className="text-xs text-muted-foreground">Comma-separated for a few at once.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-keywords-bulk">Bulk paste</Label>
            <Textarea
              id="add-keywords-bulk"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"running shoes\nbest trail shoes\nshoe size guide"}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">One keyword per line, for larger lists.</p>
          </div>

          {result ? <p className="text-sm text-success">{result}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Done
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Add keywords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
