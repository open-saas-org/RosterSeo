"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

type Recommendation = {
  id: string;
  category: "listing" | "content" | "reviews" | "technical";
  title: string;
  description: string;
  status: "todo" | "done";
};

const CATEGORY_LABELS: Record<Recommendation["category"], string> = {
  listing: "Listing completeness",
  content: "Content & pages",
  reviews: "Reviews & citations",
  technical: "Technical local SEO",
};

const CATEGORY_ORDER: Recommendation["category"][] = ["listing", "content", "reviews", "technical"];

export function OptimizeWorkspace({
  projectId,
  hasProfile,
  initialRecommendations,
}: {
  projectId: string;
  hasProfile: boolean;
  initialRecommendations: Recommendation[];
}) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  if (!hasProfile) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Save a business profile first"
        description="Optimize builds a strategy from the business saved on the Profile page."
        action={
          <Link href="/local-seo" className={cn(buttonVariants({ size: "sm" }))}>
            Go to Profile
          </Link>
        }
      />
    );
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/optimize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate a strategy.");
      setRecommendations((prev) => [...data.recommendations, ...prev]);
      if (data.recommendations.length === 0 && data.skippedDuplicates > 0) {
        setInfo(
          data.skippedDuplicates === 1
            ? "The regenerated strategy matched what's already on your checklist - nothing new to add."
            : `All ${data.skippedDuplicates} regenerated recommendations matched what's already on your checklist - nothing new to add.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a strategy. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function toggleStatus(rec: Recommendation) {
    const nextStatus = rec.status === "done" ? "todo" : "done";
    setTogglingId(rec.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/optimize/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setRecommendations((prev) => prev.map((r) => (r.id === rec.id ? { ...r, status: nextStatus } : r)));
      }
    } finally {
      setTogglingId(null);
    }
  }

  const todo = recommendations.filter((r) => r.status === "todo");
  const done = recommendations.filter((r) => r.status === "done");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {recommendations.length > 0 ? "Regenerate" : "Generate strategy"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
      </div>

      {recommendations.length === 0 && !isGenerating ? (
        <EmptyState
          icon={Sparkles}
          title="No strategy yet"
          description="Generate one from your real listing data, rank tracking, and nearby competitors."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {CATEGORY_ORDER.map((category) => {
            const items = todo.filter((r) => r.category === category);
            if (items.length === 0) return null;
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">{CATEGORY_LABELS[category]}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {items.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => toggleStatus(rec)}
                      disabled={togglingId === rec.id}
                      className="flex items-start gap-3 rounded-md border p-3 text-left hover:bg-muted/50"
                    >
                      {togglingId === rec.id ? (
                        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{rec.title}</span>
                        <span className="text-sm text-muted-foreground">{rec.description}</span>
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          {done.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Done
                  <Badge variant="secondary">{done.length}</Badge>
                </CardTitle>
                <CardDescription>Marked complete - click to reopen.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {done.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => toggleStatus(rec)}
                    disabled={togglingId === rec.id}
                    className="flex items-start gap-3 rounded-md border p-3 text-left hover:bg-muted/50"
                  >
                    {togglingId === rec.id ? (
                      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium line-through text-muted-foreground">{rec.title}</span>
                      <span className="text-sm text-muted-foreground">{rec.description}</span>
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
