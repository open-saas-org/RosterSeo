"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { BrandLookupResultCard } from "@/components/brand-lookup/brand-lookup-result-card";
import { AI_VISIBILITY_PROVIDERS, type AiVisibilityProvider } from "@rosterseo/ai-visibility";
import { lookupBrandAction, type BrandLookupResult } from "@/app/(dashboard)/brand-lookup/actions";

export function BrandLookupWorkspace({
  configured,
  providerStatus,
}: {
  configured: boolean;
  providerStatus: Record<AiVisibilityProvider, boolean>;
}) {
  const [brand, setBrand] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<BrandLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runLookup() {
    const trimmed = brand.trim();
    if (!trimmed) {
      setError("Enter a brand name or domain to check.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const lookup = await lookupBrandAction({ brand: trimmed, question: question.trim() || undefined });
        setResult(lookup);
      } catch {
        setError("Couldn't run the lookup. Try again.");
      }
    });
  }

  const mentionedCount = result ? result.providerResults.filter((r) => r.result?.mentioned).length : 0;
  const sampledCount = result ? result.providerResults.filter((r) => r.result !== null).length : 0;

  return (
    <div className="flex flex-col gap-4">
      {!configured ? (
        <Alert>
          <Bot className="size-4" />
          <AlertTitle>No LLM provider keys configured</AlertTitle>
          <AlertDescription>
            Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, or PERPLEXITY_API_KEY to enable sampling —
            real API calls only, no results are shown for an unconfigured provider.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Check a brand</CardTitle>
          <CardDescription>
            Enter a brand name or domain and, optionally, a specific question. Runs a single sample against
            every configured provider so you can see whether and how the brand comes up right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="brand-input">
                Brand or domain
              </label>
              <Input
                id="brand-input"
                placeholder="e.g. acme.com or Acme"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runLookup();
                }}
              />
            </div>
            <div className="flex-[2]">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="question-input">
                Question (optional)
              </label>
              <Input
                id="question-input"
                placeholder="e.g. best rank tracking tool for small agencies"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runLookup();
                }}
              />
            </div>
            <Button onClick={runLookup} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Search />}
              Check
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Mentioned by"
              value={`${mentionedCount}/${sampledCount}`}
              deltaLabel={`of ${sampledCount} real provider${sampledCount === 1 ? "" : "s"} sampled`}
              trend={mentionedCount > 0 ? "up" : "down"}
              icon={Sparkles}
              accent="primary"
            />
            <MetricCard
              label="Checked"
              value={result.checkedAt.slice(0, 19).replace("T", " ")}
              deltaLabel={`prompt: “${result.promptText}”`}
              trend="up"
              icon={Bot}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.providerResults.map(({ provider, result: sample }) => (
              <BrandLookupResultCard key={provider} provider={provider} result={sample} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No lookup yet"
          description="Enter a brand or domain above and run a check to see per-provider results."
        />
      )}

      <p className="text-xs text-muted-foreground">
        Provider status —{" "}
        {AI_VISIBILITY_PROVIDERS.map(
          (provider) => `${provider}: ${providerStatus[provider] ? "connected" : "not configured"}`,
        ).join(" · ")}
      </p>
    </div>
  );
}
