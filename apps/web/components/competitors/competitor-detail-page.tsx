"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchCompetitorSnapshot, type CompetitorSnapshot } from "@/app/(dashboard)/competitors/actions";
import { CompetitorDetail } from "@/components/competitors/competitor-detail";
import type { TrackedCompetitor } from "@/components/competitors/types";

// Own real route (/competitors/[id]) for "everything else" about one
// tracked competitor - top pages, backlink profile, keyword gap ideas, and
// AI Visibility mention rate, which used to all live in an expanding
// section below the Competitors list. The list page (competitor-summary-
// card.tsx) now just shows the at-a-glance metrics and links here.
export function CompetitorDetailPage({
  projectId,
  targetLocation,
  competitor: initialCompetitor,
  initialSnapshot,
  aiVisibilityPercent,
}: {
  projectId: string;
  targetLocation?: string;
  competitor: { id: string; domain: string; name: string | null; aliases: string[] | null; additionalDomains: string[] | null };
  /** Already-scanned data, read from the DB cache server-side - present
   * only if this competitor has been Scanned before. */
  initialSnapshot?: CompetitorSnapshot;
  aiVisibilityPercent?: number;
}) {
  const router = useRouter();
  // "ready" when a cached snapshot exists server-side (a Scan's results
  // survive a page refresh), otherwise "idle" - no auto-scan on page load
  // either way. Real data only loads when the user presses Scan/Rescan.
  const [competitor, setCompetitor] = useState<TrackedCompetitor>(
    initialSnapshot ? { ...initialCompetitor, status: "ready", snapshot: initialSnapshot } : { ...initialCompetitor, status: "idle" },
  );
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  async function loadSnapshot() {
    setCompetitor((prev) => ({ ...prev, status: "loading", error: undefined }));
    try {
      const snapshot = await fetchCompetitorSnapshot(projectId, initialCompetitor.domain, targetLocation);
      setCompetitor((prev) => ({ ...prev, status: "ready", snapshot, error: undefined }));
    } catch (err) {
      setCompetitor((prev) => ({ ...prev, status: "error", error: err instanceof Error ? err.message : "Failed to load data." }));
    }
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
      setCompetitor((prev) => ({
        ...prev,
        domain: body.competitor.domain,
        name: body.competitor.name,
        aliases: body.competitor.aliases,
        additionalDomains: body.competitor.additionalDomains,
      }));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't save that competitor.";
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm(`Stop tracking ${competitor.name || competitor.domain}? You can add it back anytime.`)) return;
    const res = await fetch(`/api/projects/${projectId}/competitors?id=${id}`, { method: "DELETE" });
    if (res.ok) router.push("/competitors");
  }

  function handleScan(_id: string) {
    void loadSnapshot();
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/competitors" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to Competitors
      </Link>
      <CompetitorDetail
        competitor={competitor}
        onRemove={handleRemove}
        onScan={handleScan}
        onSaveEdit={handleSaveEdit}
        isSavingEdit={isSavingEdit}
        aiVisibilityPercent={aiVisibilityPercent}
      />
    </div>
  );
}
