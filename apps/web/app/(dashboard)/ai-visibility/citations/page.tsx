import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityResults, projectCompetitors, withUserContext } from "@seo-tool/db";
import { classifyUrl, normalizeUrl, getModelDisplayLabel } from "@seo-tool/ai-visibility";
import { PageHeader } from "@/components/page-header";
import { CitationsDashboard } from "@/components/ai-visibility/citations-dashboard";
import { getCurrentProject } from "@/lib/current-project";

// Matches AiVisibilityFilterBar's AI_VISIBILITY_DAY_OPTIONS - kept as a
// plain literal here (rather than importing the "use client" filter bar
// module into a server component) since this is only used to validate the
// `days` searchParam.
const VALID_DAY_OPTIONS = new Set([7, 30, 90, 180, 365, 0]);
const DEFAULT_DAYS = 90;

export default async function CitationsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { session, project } = await getCurrentProject();
  const { days: rawDays } = await searchParams;
  const parsedDays = Number(rawDays);
  const days = VALID_DAY_OPTIONS.has(parsedDays) ? parsedDays : DEFAULT_DAYS;

  const { rows, prompts, allTags, allModels, brandDomain } = await withUserContext(session.user.id, async (tx) => {
    const [promptRows, competitors] = await Promise.all([
      tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, project.id)),
      tx.select().from(projectCompetitors).where(eq(projectCompetitors.projectId, project.id)),
    ]);

    const promptIds = promptRows.map((p) => p.id);
    const promptTextById = new Map(promptRows.map((p) => [p.id, p.promptText]));
    // Each domain list already folds in the owner's extra domains (Settings
    // > Brand's "Additional domains" / a tracked competitor's own
    // additionalDomains) so classifyUrl below attributes a citation on e.g.
    // a brand's blog subdomain or a competitor's regional site correctly,
    // instead of only ever matching the single primary domain.
    const brandDomains = [project.domain, ...(project.aiVisibilityAdditionalDomains ?? [])];
    const competitorDomains = competitors.flatMap((c) => [c.domain, ...(c.additionalDomains ?? [])]);

    // Server-side date window: `days` is the selected filter window, but the
    // fetch itself pulls 2x that (days === 0 "all time" skips the filter
    // entirely) so the dashboard's own current-vs-previous-period comparison
    // (Recent Changes, domain deltas) still has real prior data to diff
    // against, without shipping the whole unbounded citation history to the
    // client on every load.
    const cutoff = days === 0 ? null : new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

    // entityDomain IS NULL: one row per real (prompt, provider, sample) call
    // - competitor rows for that same call carry the exact same citations[]
    // array (see the run route), so including them would multiply-count
    // every real citation by (1 + tracked competitor count).
    const results =
      promptIds.length === 0
        ? []
        : await tx
            .select()
            .from(aiVisibilityResults)
            .where(
              and(
                inArray(aiVisibilityResults.promptId, promptIds),
                isNull(aiVisibilityResults.entityDomain),
                isNotNull(aiVisibilityResults.citations),
                ...(cutoff ? [gte(aiVisibilityResults.runAt, cutoff)] : []),
              ),
            );

    const rows = results.flatMap((r) => {
      const promptText = promptTextById.get(r.promptId) ?? "";
      const date = r.runAt.toISOString().slice(0, 10);
      const model = r.model ?? r.provider;
      return (r.citations ?? []).flatMap((raw) => {
        let citation: { url: string; title?: string; domain: string; citationIndex: number };
        if (typeof raw === "string") {
          try {
            citation = { url: raw, domain: new URL(raw).hostname.replace(/^www\./, ""), citationIndex: 0 };
          } catch {
            return [];
          }
        } else {
          citation = raw;
        }
        const { category, pageType } = classifyUrl(citation.url, citation.domain, citation.title, brandDomains, competitorDomains);
        return [
          {
            promptId: r.promptId,
            promptText,
            provider: r.provider,
            model,
            date,
            url: citation.url,
            normalizedUrl: normalizeUrl(citation.url),
            title: citation.title,
            domain: citation.domain,
            citationIndex: citation.citationIndex,
            category,
            pageType,
          },
        ];
      });
    });

    const modelMap = new Map<string, string>();
    for (const r of rows) modelMap.set(r.model, getModelDisplayLabel(r.provider, r.model));

    return {
      rows,
      prompts: promptRows.map((p) => ({ id: p.id, tags: p.tags ?? [] })),
      allTags: [...new Set(promptRows.flatMap((p) => p.tags ?? []))].sort(),
      allModels: [...modelMap.entries()].map(([value, label]) => ({ value, label })),
      brandDomain: project.domain,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Citations" description="See which sources LLMs cite when responding to your prompts." />
      <CitationsDashboard
        projectId={project.id}
        rows={rows}
        prompts={prompts}
        allTags={allTags}
        allModels={allModels}
        brandDomain={brandDomain}
        initialDays={days}
      />
    </div>
  );
}
