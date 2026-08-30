"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter" };
const ALL_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;

export type ClaySettings = { provider: string; model: string; configuredProviders: string[] };

export function ClaySettingsDialog({
  projectId,
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ClaySettings | null;
  onSettingsChange: (next: ClaySettings) => void;
}) {
  const [provider, setProvider] = useState(settings?.provider ?? "openrouter");
  const [model, setModel] = useState(settings?.model ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next && settings) {
      setProvider(settings.provider);
      setModel(settings.model);
    }
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clay/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      onSettingsChange({ provider, model: model || settings?.model || "", configuredProviders: settings?.configuredProviders ?? [] });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Clay settings</DialogTitle>
          <DialogDescription>Which AI provider and model this project&apos;s assistant uses.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => v && setProvider(v)}
              items={ALL_PROVIDERS.map((id) => ({
                value: id,
                label: `${PROVIDER_LABELS[id]}${settings && !settings.configuredProviders.includes(id) ? " (not configured)" : ""}`,
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_PROVIDERS.map((id) => (
                  <SelectItem key={id} value={id} disabled={!!settings && !settings.configuredProviders.includes(id)}>
                    {PROVIDER_LABELS[id]}
                    {settings && !settings.configuredProviders.includes(id) ? " (not configured)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clay-model" className="text-xs text-muted-foreground">
              Model (optional override)
            </Label>
            <Input id="clay-model" placeholder="Provider default" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={isSaving} onClick={handleSave} className="gap-1.5">
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
