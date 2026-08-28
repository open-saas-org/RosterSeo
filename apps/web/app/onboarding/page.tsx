"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Globe, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Two-step progress indicator (create -> review) - the flow previously gave
// no indication there even were two steps. Small filled/unfilled segments
// rather than a heavier stepper component, since this is a compact centered
// card, not a full wizard shell.
function StepIndicator({ step, className }: { step: 1 | 2; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <span className={cn("h-1.5 w-6 rounded-full transition-colors", step === 1 ? "bg-primary" : "bg-muted")} />
        <span className={cn("h-1.5 w-6 rounded-full transition-colors", step === 2 ? "bg-primary" : "bg-muted")} />
      </div>
      <span className="text-xs text-muted-foreground">Step {step} of 2</span>
    </div>
  );
}

// Local shape, deliberately not imported from @seo-tool/ai-visibility - this
// is a client component, and importing only the type keeps this file fully
// decoupled from that package's server-only provider code.
type OnboardingResearch = {
  canonicalName: string;
  additionalDomains: string[];
  aliases: string[];
  competitors: Array<{ name: string; domains: string[]; aliases: string[] }>;
  suggestedPrompts: Array<{ text: string; branded: boolean }>;
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageInner />
    </Suspense>
  );
}

function OnboardingPageInner() {
  const router = useRouter();
  const isAdditional = useSearchParams().get("additional") === "1";
  const [step, setStep] = useState<"form" | "review">("form");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [research, setResearch] = useState<OnboardingResearch | null>(null);
  const [acceptedCompetitors, setAcceptedCompetitors] = useState<Set<number>>(new Set());
  const [acceptedPrompts, setAcceptedPrompts] = useState<Set<number>>(new Set());

  const errorRef = useRef<HTMLDivElement>(null);

  // The failed-creation error can land above already-filled-in fields where
  // it's easy to miss, especially once the form has scrolled - bring it
  // into view instead of relying on the user noticing it appeared.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, domain, targetLocation: targetLocation || undefined }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.formErrors?.[0] ?? body?.error ?? "Could not create your project.");
      setIsSubmitting(false);
      return;
    }

    const { project } = await res.json();
    setProjectId(project.id);

    // Real, web-search-enabled brand research (Phase F) - a project with no
    // structured-research-capable provider configured (OpenRouter, OpenAI,
    // or Anthropic) just returns { research: null } here, and we skip
    // straight to the dashboard rather than show a broken/empty review step.
    // This is the one moment the product does something genuinely
    // impressive (live AI web research on the brand), so the button gets
    // its own interstitial copy instead of staying a plain spinner.
    setIsResearching(true);
    try {
      const researchRes = await fetch(`/api/projects/${project.id}/ai-visibility/onboarding-research`, { method: "POST" });
      const researchBody = await researchRes.json().catch(() => ({ research: null }));
      if (researchRes.ok && researchBody.research) {
        const r: OnboardingResearch = researchBody.research;
        setResearch(r);
        setAcceptedCompetitors(new Set(r.competitors.map((_, i) => i)));
        setAcceptedPrompts(new Set(r.suggestedPrompts.map((_, i) => i)));
        setStep("review");
        setIsSubmitting(false);
        setIsResearching(false);
        return;
      }
    } catch {
      // Research is a best-effort enhancement - any failure here just
      // falls through to the plain redirect below.
    }

    router.push("/");
    router.refresh();
  }

  function toggle(set: Set<number>, setSet: (s: Set<number>) => void, index: number) {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSet(next);
  }

  async function handleFinish() {
    if (!projectId || !research) return;
    setIsFinishing(true);

    const competitorInserts = research.competitors
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => acceptedCompetitors.has(i))
      .map(({ c }) => ({ name: c.name, domain: c.domains[0] }))
      .filter((c): c is { name: string; domain: string } => !!c.domain);

    const promptInserts = research.suggestedPrompts
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => acceptedPrompts.has(i))
      .map(({ p }) => p.text);

    await Promise.all([
      ...competitorInserts.map(({ name, domain }) =>
        fetch(`/api/projects/${projectId}/competitors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, name }),
        }),
      ),
      ...promptInserts.map((promptText) =>
        fetch(`/api/projects/${projectId}/ai-visibility`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptText }),
        }),
      ),
    ]);

    router.push("/");
    router.refresh();
  }

  function handleSkip() {
    router.push("/");
    router.refresh();
  }

  if (step === "review" && research) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
        <StepIndicator step={2} />
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          Suggested starting point for {research.canonicalName}
        </div>
        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitors</CardTitle>
              <CardDescription>Real competitors found via web search - uncheck any that don&apos;t fit.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {research.competitors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No competitors found.</p>
              ) : (
                research.competitors.map((c, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/40"
                  >
                    <Checkbox checked={acceptedCompetitors.has(i)} onCheckedChange={() => toggle(acceptedCompetitors, setAcceptedCompetitors, i)} />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.domains[0]}</span>
                  </label>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Starter prompts to track</CardTitle>
              <CardDescription>A mix of unbranded and branded questions - uncheck any you don&apos;t want tracked.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {research.suggestedPrompts.map((p, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/40"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={acceptedPrompts.has(i)}
                    onCheckedChange={() => toggle(acceptedPrompts, setAcceptedPrompts, i)}
                  />
                  <span className="flex-1">{p.text}</span>
                  {p.branded ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      branded
                    </Badge>
                  ) : null}
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSkip} disabled={isFinishing}>
            Skip
          </Button>
          <Button onClick={handleFinish} disabled={isFinishing}>
            {isFinishing ? <Loader2 className="size-4 animate-spin" /> : null}
            Save and continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Globe className="size-4" />
        </div>
        SEO Tool
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <StepIndicator step={1} className="mb-1" />
          <CardTitle>{isAdditional ? "Add a project" : "Create your first project"}</CardTitle>
          <CardDescription>A project tracks one domain or brand — rankings, audits, and AI visibility.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {error ? (
              <Alert variant="destructive" ref={errorRef}>
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                placeholder="Acme Co."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetLocation">Target market / location (optional)</Label>
              <Input
                id="targetLocation"
                placeholder="United States"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
              />
            </div>
            <div className="mt-2 flex gap-2">
              {isAdditional ? (
                <Button type="button" variant="outline" className="flex-1" onClick={() => router.push("/")} disabled={isSubmitting}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" disabled={isSubmitting} className={isAdditional ? "flex-1" : "w-full"}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {isResearching ? "Researching your brand…" : "Create project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
