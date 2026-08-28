"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { fetchCompetitorSnapshot, type CompetitorSnapshot } from "@/app/(dashboard)/competitors/actions";
import { AddCompetitorForm } from "@/components/competitors/add-competitor-form";
import { CompetitorSummaryCard } from "@/components/competitors/competitor-summary-card";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";
import type { TrackedCompetitor } from "@/components/competitors/types";

// The tracked-competitor *list* is persisted via the real RLS-scoped API
// route (app/api/projects/[projectId]/competitors/route.ts) - the page
// loads the initial list server-side and add/remove below POST/DELETE
// against that route. Domain *stats* (traffic, backlinks, keyword ideas)
// are a separate concern, fetched straight from @seo-tool/dataforseo via a
// Server Action - see app/(dashboard)/competitors/actions.ts.
export function CompetitorWorkspace({
  projectId,
  initialCompetitors,
  targetLocation,
  initialSnapshots,
}: {
  projectId: string;
  initialCompetitors: Array<{
    id: string;
    domain: string;
    name: string | null;
    aliases: string[] | null;
    additionalDomains: string[] | null;
  }>;
  /** Project's free-text target location (e.g. "United Kingdom") - resolved
   * to a real DataForSEO location_code server-side so competitor stats
   * reflect the project's actual market instead of always defaulting to US. */
  targetLocation?: string;
  /** Already-scanned data, read from the DB cache server-side, keyed by
   * domain - a competitor with a cached row here starts "ready" instead of
   * "idle" so a Scan's results survive a page refresh. */
  initialSnapshots: Record<string, CompetitorSnapshot>;
}) {
  // "idle" (no cached snapshot) or "ready" (cached snapshot found on the
  // server) - either way, nothing here auto-scans. A competitor only gets
  // a fresh DataForSEO call when the user presses Scan themselves
  // (CompetitorSummaryCard/CompetitorDetail's Scan button), never on page
  // load and never right after adding one.
  const [competitors, setCompetitors] = useState<TrackedCompetitor[]>(() =>
    initialCompetitors.map((c) => {
      const snapshot = initialSnapshots[c.domain];
      return snapshot ? { ...c, status: "ready" as const, snapshot } : { ...c, status: "idle" as const };
    }),
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  async function loadSnapshot(id: string, domain: string) {
    setCompetitors((prev) => prev.map((c) => (c.id === id ? { ...c, status: "loading", error: undefined } : c)));
    try {
      const snapshot = await fetchCompetitorSnapshot(projectId, domain, targetLocation);
      setCompetitors((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "ready", snapshot, error: undefined } : c)),
      );
    } catch (err) {
      setCompetitors((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "error", error: err instanceof Error ? err.message : "Failed to load data." }
            : c,
        ),
      );
    }
  }

  function handleScan(id: string) {
    const competitor = competitors.find((c) => c.id === id);
    if (!competitor) return;
    void loadSnapshot(id, competitor.domain);
  }

  async function handleAdd(rawDomain: string): Promise<string | null> {
    const domain = normalizeDomain(rawDomain);
    if (!isValidDomain(domain)) {
      return "Enter a valid domain, e.g. competitor.com";
    }
    if (competitors.some((c) => c.domain === domain)) {
      return "You're already tracking this domain.";
    }

    const res = await fetch(`/api/projects/${projectId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return body?.error ?? "Couldn't track that domain. Try again.";
    }

    const id: string = body.competitor.id;
    setCompetitors((prev) => [...prev, { id, domain, name: null, aliases: null, additionalDomains: null, status: "idle" }]);
    return null;
  }

  async function handleSaveEdit(id: string, updates: { name: string; domain: string; aliases: string[]; additionalDomains: string[] }) {
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Couldn't save that competitor.");
      setCompetitors((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                domain: body.competitor.domain,
                name: body.competitor.name,
                aliases: body.competitor.aliases,
                additionalDomains: body.competitor.additionalDomains,
              }
            : c,
        ),
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't save that competitor.";
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleRemove(id: string) {
    const competitor = competitors.find((c) => c.id === id);
    if (!competitor) return;
    if (!confirm(`Stop tracking ${competitor.name || competitor.domain}? You can add it back anytime.`)) return;

    const previous = competitors;
    setCompetitors((prev) => prev.filter((c) => c.id !== id));

    const res = await fetch(`/api/projects/${projectId}/competitors?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      // Revert on failure so the tracked list doesn't silently drift from
      // what's actually persisted.
      setCompetitors(previous);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className={competitors.length === 0 ? "border-lavender/30 bg-lavender/5" : undefined}>
        <CardHeader>
          <CardTitle>Track a competitor</CardTitle>
          <CardDescription>Add a domain, then press Scan on it whenever you want fresh traffic, keyword, and backlink data - nothing scans automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddCompetitorForm onAdd={handleAdd} />
        </CardContent>
      </Card>

      {competitors.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="No competitors tracked yet"
          description="Add a competitor domain above to see how they stack up on traffic, keywords, and backlinks."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {competitors.map((competitor) => (
            <CompetitorSummaryCard
              key={competitor.id}
              competitor={competitor}
              onRemove={handleRemove}
              onScan={handleScan}
              onSaveEdit={handleSaveEdit}
              isSavingEdit={isSavingEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
