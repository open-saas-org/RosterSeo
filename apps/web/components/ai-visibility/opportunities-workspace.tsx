"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Clock, ExternalLink, Loader2, Sparkles, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import { cn } from "@/lib/utils";

type OpportunityCategory = "creation" | "existing-content" | "outreach" | "social";
type CitationRef = { url: string; title?: string; domain: string; count: number };
type OpportunityItem = {
  category: OpportunityCategory;
  title: string;
  why: string;
  promptRefs: Array<{ promptId: string | null; promptText: string }>;
  yourCitations: CitationRef[];
  competitorCitations: CitationRef[];
};
type OpportunitiesReport = { summary: string[]; risks: string[]; opportunities: OpportunityItem[] };
type OpportunitiesResponse = { report: OpportunitiesReport | null; provider: string | null; model: string | null; generatedAt: string | null };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CATEGORY_META: Array<{ key: OpportunityCategory; label: string; description: string }> = [
  { key: "creation", label: "Creation", description: "Net-new content to publish or earn — comparisons, guides, and ‘best of’ angles for topics you're absent on." },
  { key: "existing-content", label: "Existing Content", description: "Pages already getting cited that are slipping, or could win the mention with a refresh." },
  { key: "outreach", label: "Outreach", description: "Earn placements on the third-party review sites and editorial roundups assistants cite." },
  { key: "social", label: "Social", description: "Show up in the community conversations — Reddit, YouTube, forums — assistants pull from." },
];

type Tab = "prompts" | "your" | "comp";

function Pill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-foreground/30 bg-muted" : "border-border text-muted-foreground hover:bg-muted/60",
      )}
    >
      {label} ({count})
      <span className={cn("transition-transform", active && "rotate-180")}>▾</span>
    </button>
  );
}

function OpportunityCard({ item }: { item: OpportunityItem }) {
  const [open, setOpen] = useState<Tab | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div>
          <p className="font-semibold">{item.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill label="Prompts" count={item.promptRefs.length} active={open === "prompts"} onClick={() => setOpen((p) => (p === "prompts" ? null : "prompts"))} />
          <Pill label="Your citations" count={item.yourCitations.length} active={open === "your"} onClick={() => setOpen((p) => (p === "your" ? null : "your"))} />
          <Pill label="Competitor citations" count={item.competitorCitations.length} active={open === "comp"} onClick={() => setOpen((p) => (p === "comp" ? null : "comp"))} />
        </div>

        {open === "prompts" ? (
          <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
            {item.promptRefs.length === 0 ? (
              <p className="px-1 py-1 text-xs text-muted-foreground">No specific prompts linked.</p>
            ) : (
              item.promptRefs.map((p, i) =>
                p.promptId === null ? (
                  <p key={i} className="flex items-center gap-1.5 truncate px-1 py-1 text-xs text-muted-foreground">
                    <span className="truncate">{p.promptText}</span>
                    <span
                      className="shrink-0 text-[10px] text-muted-foreground/70"
                      title="This prompt text didn't match one of your tracked prompts exactly, so citation counts below may be incomplete for it."
                    >
                      (unmatched)
                    </span>
                  </p>
                ) : (
                  <Link
                    key={i}
                    href={`/ai-visibility/visibility/${p.promptId}`}
                    className="flex items-center gap-1.5 truncate px-1 py-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <span className="truncate">{p.promptText}</span>
                  </Link>
                ),
              )
            )}
          </div>
        ) : null}

        {open === "your" ? (
          <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
            {item.yourCitations.length === 0 ? (
              <p className="px-1 py-1 text-xs text-muted-foreground">You&apos;re not cited for these prompts yet.</p>
            ) : (
              item.yourCitations.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 truncate px-1 py-1 text-xs hover:underline">
                  <span className="truncate">{c.title || c.domain}</span>
                  <span className="shrink-0 text-muted-foreground">· {c.domain}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              ))
            )}
          </div>
        ) : null}

        {open === "comp" ? (
          <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
            {item.competitorCitations.length === 0 ? (
              <p className="px-1 py-1 text-xs text-muted-foreground">No competitor pages cited for these prompts.</p>
            ) : (
              item.competitorCitations.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 truncate px-1 py-1 text-xs hover:underline">
                  <span className="truncate">{c.title || c.domain}</span>
                  <span className="shrink-0 text-muted-foreground">· {c.domain}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OpportunitiesWorkspace({ projectId }: { projectId: string }) {
  const { data, isLoading, mutate } = useSWR<OpportunitiesResponse>(`/api/projects/${projectId}/ai-visibility/opportunities`, fetcher);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/opportunities`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't generate a report.");
      mutate(body, { revalidate: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a report.");
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  const report = data?.report ?? null;

  if (!report || report.opportunities.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={Target}
          title="No opportunities report yet"
          description="Generate a real, LLM-analyzed report of what to create, update, and pursue based on your tracked prompts' brand-vs-competitor standing and cited sources."
        />
        <Button onClick={handleGenerate} disabled={isGenerating} variant="ai" className="w-fit gap-2">
          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate report
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  const byCategory = CATEGORY_META.map((meta) => ({ ...meta, items: report.opportunities.filter((o) => o.category === meta.key) })).filter((c) => c.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {data?.generatedAt ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-3.5" />
            Last evaluated {new Date(data.generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        ) : (
          <span />
        )}
        <Button onClick={handleGenerate} disabled={isGenerating} variant="ai" size="sm" className="gap-2">
          {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Regenerate
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {report.summary.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 text-sm font-semibold">Summary</p>
            <ul className="flex flex-col gap-1.5">
              {report.summary.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {byCategory.map((c) => (
        <div key={c.key} className="flex flex-col gap-4">
          <div>
            <p className="font-semibold">
              {c.label} <Badge variant="lavender" className="align-middle">{c.items.length}</Badge>
            </p>
            <p className="text-sm text-muted-foreground">{c.description}</p>
          </div>
          <div className="flex flex-col gap-4">
            {c.items.map((item, i) => (
              <OpportunityCard key={i} item={item} />
            ))}
          </div>
        </div>
      ))}

      {report.risks.length > 0 ? (
        <div className="flex flex-col gap-4">
          <p className="font-semibold">Reality Check</p>
          <ul className="flex flex-col gap-1.5">
            {report.risks.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">Generated by AI from your tracked citation data. Suggestions are a starting point — apply your own judgment before acting.</p>
    </div>
  );
}
