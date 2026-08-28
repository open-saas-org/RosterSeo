import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { Activity, ArrowRight, Clock, Eye, ListTree, Megaphone, RefreshCw, Tag, Tags } from "lucide-react";
import { aiVisibilityPrompts, aiVisibilityResults, withUserContext } from "@seo-tool/db";
import { calculateVisibilityScore, isBrandedPrompt } from "@seo-tool/ai-visibility";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AiVisibilityTrendAreaChart } from "@/components/ai-visibility/ai-visibility-trend-area-chart";
import { getCurrentProject } from "@/lib/current-project";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return "<1h";
  if (hours < 24) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
}

function formatAgo(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function AiVisibilityOverviewPage() {
  const { session, project } = await getCurrentProject();
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const {
    visibilityTrend,
    shareOfVoiceTrend,
    promptsTracked,
    evaluations30d,
    runFrequencyLabel,
    lastUpdatedLabel,
    brandedVisibilityPercent,
    unbrandedVisibilityPercent,
    brandedSampleCount,
    unbrandedSampleCount,
  } = await withUserContext(session.user.id, async (tx) => {
    const prompts = await tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id));
    const promptsTracked = prompts.filter((p) => p.enabled).length;
    const promptIds = prompts.map((p) => p.id);

    // Which tracked prompts already name the brand (by name or domain) -
    // per PromptDetail/opportunities' existing isBrandedPrompt heuristic
    // (packages/ai-visibility/src/types.ts). Unbranded prompts are where
    // new visibility is actually won, so splitting the blended number out
    // matters more than the overall figure alone.
    const brandedPromptIds = new Set(
      prompts.filter((p) => isBrandedPrompt(p.promptText, project.name, project.domain)).map((p) => p.id),
    );

    if (promptIds.length === 0) {
      return {
        visibilityTrend: [] as Array<{ date: string; visibilityPercent: number }>,
        shareOfVoiceTrend: [] as Array<{ date: string; shareOfVoicePercent: number }>,
        promptsTracked,
        evaluations30d: 0,
        runFrequencyLabel: "No runs yet",
        lastUpdatedLabel: "Never",
        brandedVisibilityPercent: null as number | null,
        unbrandedVisibilityPercent: null as number | null,
        brandedSampleCount: 0,
        unbrandedSampleCount: 0,
      };
    }

    const results = await tx
      .select()
      .from(aiVisibilityResults)
      .where(and(inArray(aiVisibilityResults.promptId, promptIds), gte(aiVisibilityResults.runAt, cutoff)))
      .orderBy(aiVisibilityResults.runAt);

    // Visibility %: brand-only rows (entityDomain null), grouped by real
    // calendar day. Share of Voice %: brand's share of every real mention
    // (brand + tracked competitors) that day - same underlying rows, two
    // different real rollups, no extra sampling needed for either.
    const byDayBrand = new Map<string, { mentioned: boolean }[]>();
    const byDaySov = new Map<string, { brand: number; total: number }>();
    const earliestRunAtByRunId = new Map<string, Date>();
    // Branded vs. unbranded split (task: Overview should show visibility
    // separately for prompts that already name the brand vs. ones that
    // don't) - accumulated over the same 30-day/brand-only rows as
    // byDayBrand, just bucketed by prompt instead of by day.
    const brandedSamples: { mentioned: boolean }[] = [];
    const unbrandedSamples: { mentioned: boolean }[] = [];

    for (const r of results) {
      const day = r.runAt.toISOString().slice(0, 10);
      if (r.entityDomain === null) {
        const list = byDayBrand.get(day) ?? [];
        list.push({ mentioned: r.mentioned });
        byDayBrand.set(day, list);

        (brandedPromptIds.has(r.promptId) ? brandedSamples : unbrandedSamples).push({ mentioned: r.mentioned });
      }
      if (r.mentioned) {
        const entry = byDaySov.get(day) ?? { brand: 0, total: 0 };
        entry.total += 1;
        if (r.entityDomain === null) entry.brand += 1;
        byDaySov.set(day, entry);
      }
      const existing = earliestRunAtByRunId.get(r.runId);
      if (!existing || r.runAt < existing) earliestRunAtByRunId.set(r.runId, r.runAt);
    }

    const visibilityTrend = [...byDayBrand.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, samples]) => ({ date, visibilityPercent: calculateVisibilityScore(samples) }));

    const shareOfVoiceTrend = [...byDaySov.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { brand, total }]) => ({ date, shareOfVoicePercent: total > 0 ? Math.round((brand / total) * 100) : 0 }));

    const runTimes = [...earliestRunAtByRunId.values()].sort((a, b) => a.getTime() - b.getTime());
    let runFrequencyLabel = "No runs yet";
    if (runTimes.length === 1) {
      runFrequencyLabel = "1 run so far";
    } else if (runTimes.length > 1) {
      const gaps = runTimes.slice(1).map((t, i) => t.getTime() - runTimes[i]!.getTime());
      runFrequencyLabel = formatDuration(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    const lastUpdatedLabel = results.length > 0 ? formatAgo(Date.now() - results[results.length - 1]!.runAt.getTime()) : "Never";

    return {
      visibilityTrend,
      shareOfVoiceTrend,
      promptsTracked,
      evaluations30d: results.length,
      runFrequencyLabel,
      lastUpdatedLabel,
      brandedVisibilityPercent: brandedSamples.length > 0 ? calculateVisibilityScore(brandedSamples) : null,
      unbrandedVisibilityPercent: unbrandedSamples.length > 0 ? calculateVisibilityScore(unbrandedSamples) : null,
      brandedSampleCount: brandedSamples.length,
      unbrandedSampleCount: unbrandedSamples.length,
    };
  });

  const currentVisibility = visibilityTrend.at(-1)?.visibilityPercent ?? 0;
  const currentSov = shareOfVoiceTrend.at(-1)?.shareOfVoicePercent ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" description="Real visibility and share-of-voice trends across your last 30 days of tracking." />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="size-5 text-muted-foreground" />
            AI Visibility
          </h3>
          <Link href="/ai-visibility/visibility" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View Visibility
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <Card className="flex items-center justify-center border-primary/20 bg-primary/5">
            <CardContent className="py-6 text-center">
              <span className="text-6xl font-bold tabular-nums text-primary">{currentVisibility}%</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">Visibility Trend (30d)</p>
              {visibilityTrend.length === 0 ? (
                <p className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                  No runs in the last 30 days yet.
                </p>
              ) : (
                <AiVisibilityTrendAreaChart data={visibilityTrend} dataKey="visibilityPercent" label="Visibility %" colorVar="var(--chart-1)" />
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-2">
                <Tag className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Branded prompts</p>
                  <p className="text-xs text-muted-foreground">
                    {brandedSampleCount > 0 ? `${brandedSampleCount.toLocaleString()} evaluations (30d)` : "No branded prompts tracked yet"}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold tabular-nums">{brandedVisibilityPercent ?? "–"}{brandedVisibilityPercent !== null ? "%" : ""}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-2">
                <Tags className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Unbranded prompts</p>
                  <p className="text-xs text-muted-foreground">
                    {unbrandedSampleCount > 0 ? `${unbrandedSampleCount.toLocaleString()} evaluations (30d)` : "No unbranded prompts tracked yet"}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold tabular-nums">{unbrandedVisibilityPercent ?? "–"}{unbrandedVisibilityPercent !== null ? "%" : ""}</span>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Branded prompts already name your brand (e.g. &quot;{project.name} reviews&quot;) - unbranded prompts (e.g. &quot;best tools for X&quot;) are where new visibility is actually won.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="size-5 text-muted-foreground" />
            Share of Voice
          </h3>
          <Link href="/ai-visibility/share-of-voice" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View Share of Voice
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <Card className="flex items-center justify-center border-ai-accent/20 bg-ai-accent/5">
            <CardContent className="py-6 text-center">
              <span className="text-6xl font-bold tabular-nums text-ai-accent">{currentSov}%</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-2 text-sm font-medium">Share of Voice Trend (30d)</p>
              {shareOfVoiceTrend.length === 0 ? (
                <p className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                  No runs in the last 30 days yet.
                </p>
              ) : (
                <AiVisibilityTrendAreaChart data={shareOfVoiceTrend} dataKey="shareOfVoicePercent" label="Share of Voice %" colorVar="var(--chart-2)" />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 border-t pt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ListTree className="size-4" />
          <strong className="font-semibold text-foreground">{promptsTracked}</strong> prompts tracked
        </span>
        <span className="flex items-center gap-1.5">
          <Activity className="size-4" />
          <strong className="font-semibold text-foreground">{evaluations30d.toLocaleString()}</strong> evaluations (30d)
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />
          <strong className="font-semibold text-foreground">{runFrequencyLabel}</strong> run frequency
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="size-4" />
          <strong className="font-semibold text-foreground">{lastUpdatedLabel}</strong> last updated
        </span>
      </div>
    </div>
  );
}
