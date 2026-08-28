"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Real GetUserSites picker for "which verified Bing site should this
// project report on" - mirrors PropertyPicker's shape but Bing sites are
// plain URL strings, not { id, label } properties tied to an OAuth
// connection, since Bing auth is one global API key, not per-project OAuth.
export function BingSitePicker({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [sites, setSites] = useState<{ url: string }[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadSites = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    setSites(null);
    fetch(`/api/projects/${projectId}/bing-insights/sites`)
      .then(async (res) => {
        if (!res.ok) throw new Error("load_failed");
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setSites(body.sites ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Couldn't load your Bing Webmaster sites.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => loadSites(), [loadSites]);

  function handleSave() {
    if (!selected) {
      setSaveError("Choose a site first.");
      return;
    }
    setSaveError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/bing-insights`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: selected }),
      });
      if (!res.ok) {
        setSaveError("Couldn't save that site. Try again.");
        return;
      }
      router.refresh();
    });
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" className="w-fit" onClick={loadSites}>
          Retry
        </Button>
      </div>
    );
  }
  if (sites === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading your Bing Webmaster sites…
      </div>
    );
  }
  if (sites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No verified sites found for this Bing Webmaster Tools account. Add and verify your site at{" "}
        <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer" className="underline underline-offset-4">
          bing.com/webmasters
        </a>{" "}
        first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={selected}
        onValueChange={(v) => setSelected(v ?? undefined)}
        items={sites.map((site) => ({ value: site.url, label: site.url }))}
      >
        <SelectTrigger className="sm:w-72">
          <SelectValue placeholder="Choose a Bing site" />
        </SelectTrigger>
        <SelectContent>
          {sites.map((site) => (
            <SelectItem key={site.url} value={site.url}>
              {site.url}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? <Loader2 className="animate-spin" /> : null}
        Save
      </Button>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
    </div>
  );
}
