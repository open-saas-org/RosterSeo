"use client";

import { useState } from "react";
import { Sparkles, Search, Bot, Target, MessageSquareText, Check, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PageAnalysisRecommendation, SuggestedPrompt } from "@seo-tool/ai-visibility";
import type { KeywordMetrics } from "@seo-tool/dataforseo";
import type { PageAnalysisAiSuggestions } from "@/components/page-analyzer/analysis";

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "success"> = {
  high: "destructive",
  medium: "warning",
  low: "success",
};

function RecommendationList({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: PageAnalysisRecommendation[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h4 className="font-medium">{title}</h4>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col gap-1 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{item.title}</span>
              <Badge variant={PRIORITY_VARIANT[item.priority]} className="shrink-0 capitalize">
                {item.priority}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{item.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeywordOpportunities({ keywords }: { keywords: KeywordMetrics[] }) {
  if (keywords.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-seo" />
        <h4 className="font-medium">Keyword opportunities</h4>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Keyword</th>
              <th className="px-3 py-2 text-right font-medium">Volume</th>
              <th className="px-3 py-2 text-right font-medium">Difficulty</th>
              <th className="px-3 py-2 text-right font-medium">CPC</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.keyword} className="border-t">
                <td className="px-3 py-2">{k.keyword}</td>
                <td className="px-3 py-2 text-right tabular-nums">{k.searchVolume.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{k.difficulty}/100</td>
                <td className="px-3 py-2 text-right tabular-nums">${k.cpc.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Real DataForSEO numbers - candidates the AI proposed with no real data were dropped, not shown with invented volume/difficulty.</p>
    </div>
  );
}

function PromptSuggestions({ prompts, projectId }: { prompts: SuggestedPrompt[]; projectId: string }) {
  const [tracked, setTracked] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<number | null>(null);

  async function trackPrompt(index: number, text: string) {
    setPending(index);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText: text }),
      });
      if (res.ok) setTracked((prev) => new Set(prev).add(index));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MessageSquareText className="size-4 text-muted-foreground" />
        <h4 className="font-medium">AI Overview & LLM prompts</h4>
      </div>
      <ul className="flex flex-col gap-3">
        {prompts.map((p, i) => (
          <li key={i} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{p.text}</p>
              <p className="text-sm text-muted-foreground">{p.rationale}</p>
            </div>
            <Button
              size="sm"
              variant={tracked.has(i) ? "success" : "outline"}
              className="shrink-0 gap-1.5"
              disabled={tracked.has(i) || pending === i}
              onClick={() => trackPrompt(i, p.text)}
            >
              {tracked.has(i) ? <Check className="size-3.5" /> : pending === i ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {tracked.has(i) ? "Tracked" : "Track this prompt"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Naive fallback renderer for reports generated before this rebuild (plain
// freeform prose, split on newlines) - so old history rows stay viewable
// instead of crashing on the new structured shape they never had.
function LegacyGuidanceSection({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h4 className="font-medium">{title}</h4>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-6 text-sm text-muted-foreground">
        {lines.map((line, i) => (
          <li key={i}>{line.replace(/^[-*]\s*/, "")}</li>
        ))}
      </ul>
    </div>
  );
}

export function GuidanceCard({
  projectId,
  aiSuggestions,
  aiUnavailableReason,
  legacyRankingGuidance,
  legacyAiVisibilityGuidance,
}: {
  projectId: string;
  aiSuggestions?: PageAnalysisAiSuggestions | null;
  aiUnavailableReason?: "not_configured" | "failed";
  legacyRankingGuidance?: string | null;
  legacyAiVisibilityGuidance?: string | null;
}) {
  const hasStructured = !!aiSuggestions;
  const hasLegacy = !hasStructured && !!(legacyRankingGuidance || legacyAiVisibilityGuidance);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              AI guidance
            </CardTitle>
            <CardDescription>How to outrank the competitors above, get surfaced in AI answers, and what to track next.</CardDescription>
          </div>
          {aiSuggestions?.model ? <Badge variant="secondary">Generated by OpenRouter · {aiSuggestions.model}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {hasStructured ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <RecommendationList icon={Search} title="Rank higher on Google" items={aiSuggestions.rankingRecommendations} />
              <RecommendationList icon={Bot} title="Get surfaced in AI answers" items={aiSuggestions.aiVisibilityRecommendations} />
            </div>
            <KeywordOpportunities keywords={aiSuggestions.keywordOpportunities} />
            <PromptSuggestions prompts={aiSuggestions.suggestedPrompts} projectId={projectId} />
          </>
        ) : hasLegacy ? (
          <div className="grid gap-6 md:grid-cols-2">
            {legacyRankingGuidance ? <LegacyGuidanceSection icon={Search} title="Rank higher on Google" text={legacyRankingGuidance} /> : null}
            {legacyAiVisibilityGuidance ? (
              <LegacyGuidanceSection icon={Bot} title="Get surfaced in AI answers" text={legacyAiVisibilityGuidance} />
            ) : null}
          </div>
        ) : aiUnavailableReason === "failed" ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="size-6 text-warning" />
            <p className="max-w-md text-sm">
              AI guidance generation failed for this report (OpenRouter is configured - the call itself didn&apos;t
              succeed after retrying). This can be transient - re-run the analysis to try again.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Bot className="size-6" />
            <p className="max-w-md text-sm">
              Configure OpenRouter (<code>OPENROUTER_API_KEY</code>) to get AI-generated ranking guidance, AI-visibility
              guidance, real keyword opportunities, and AI Overview / LLM prompt suggestions for this page.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
