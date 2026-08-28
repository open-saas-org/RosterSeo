import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { aiVisibilityPrompts, aiVisibilityReportShares, aiVisibilityResults, db, withUserContext } from "@seo-tool/db";
import { calculateVisibilityScore } from "@seo-tool/ai-visibility";
import { auth } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/api-utils";
import { ReportPrintButton } from "@/components/ai-visibility/report-print-button";
import { ReportShareButton } from "@/components/ai-visibility/report-share-button";

// A live-rendered, print-CSS-driven AI Visibility snapshot report - deliberately
// outside the (dashboard) route group so it renders with no sidebar/topbar
// chrome, just the report content plus one print button. Unlike Elmo's
// version (a frozen JSON snapshot built by an async report-generation job
// queue we don't have), this renders straight from the database on every
// view - simpler, no new table/job, and always current as of the moment
// it's opened.
//
// Reachable two ways: a real logged-in session with real access to this
// project (the owner's own view, with the Share/Print buttons), or a bare
// ?token= matching a live row in ai_visibility_report_shares (an anonymous
// visitor following a link the owner generated and can revoke at any
// time) - see that table's schema comment for how the token bootstraps a
// real RLS context (withUserContext(createdByUserId, ...)) without the
// visitor ever having a session of their own.

export default async function AiVisibilityReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { projectId } = await params;
  const { token } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  let project;
  let contextUserId: string;
  let isOwnerView: boolean;

  if (session) {
    project = await requireProjectAccess(projectId, session.user.id);
    if (!project) notFound();
    contextUserId = session.user.id;
    isOwnerView = true;
  } else {
    if (!token) redirect("/login");
    // Deliberately unscoped - this table has no RLS (it IS the access
    // credential), same pattern as the MCP server's own API-key bootstrap
    // lookup (apps/mcp-server/src/index.ts's resolveUserId).
    const [share] = await db.select().from(aiVisibilityReportShares).where(eq(aiVisibilityReportShares.token, token)).limit(1);
    if (!share || share.projectId !== projectId) redirect("/login");
    contextUserId = share.createdByUserId;
    isOwnerView = false;
    const found = await requireProjectAccess(projectId, contextUserId);
    if (!found) notFound();
    project = found;
  }

  const data = await withUserContext(contextUserId, async (tx) => {
    const prompts = await tx.select().from(aiVisibilityPrompts).where(eq(aiVisibilityPrompts.projectId, projectId));
    if (prompts.length === 0) {
      return { prompts: [], shareOfVoice: [], perPrompt: [], contentGap: [], topCitedDomains: [], generatedFromRunAt: null as Date | null };
    }

    const allResults = await tx
      .select()
      .from(aiVisibilityResults)
      .where(
        inArray(
          aiVisibilityResults.promptId,
          prompts.map((p) => p.id),
        ),
      )
      .orderBy(desc(aiVisibilityResults.runAt));

    if (allResults.length === 0) {
      return { prompts, shareOfVoice: [], perPrompt: [], contentGap: [], topCitedDomains: [], generatedFromRunAt: null };
    }

    const latestRunId = allResults[0]!.runId;
    const latestRows = allResults.filter((r) => r.runId === latestRunId);

    const byEntity = new Map<string | null, { mentioned: boolean }[]>();
    for (const row of latestRows) {
      const list = byEntity.get(row.entityDomain) ?? [];
      list.push({ mentioned: row.mentioned });
      byEntity.set(row.entityDomain, list);
    }
    const shareOfVoice = [...byEntity.entries()]
      .map(([entityDomain, samples]) => ({
        entityDomain,
        isBrand: entityDomain === null,
        mentionPercent: calculateVisibilityScore(samples),
      }))
      .sort((a, b) => (a.isBrand ? -1 : b.isBrand ? 1 : b.mentionPercent - a.mentionPercent));

    const perPrompt = prompts.map((prompt) => {
      const rows = latestRows.filter((r) => r.promptId === prompt.id);
      const brandRows = rows.filter((r) => r.entityDomain === null);
      const competitorRows = rows.filter((r) => r.entityDomain !== null);
      const brandMentioned = brandRows.some((r) => r.mentioned);
      const competitorMentioned = competitorRows.some((r) => r.mentioned);
      return {
        promptId: prompt.id,
        promptText: prompt.promptText,
        brandMentionPercent: brandRows.length > 0 ? calculateVisibilityScore(brandRows) : null,
        competitorMentioned,
        contentGap: !brandMentioned && competitorMentioned,
      };
    });
    const contentGap = perPrompt.filter((p) => p.contentGap);

    const domainCounts = new Map<string, number>();
    for (const row of allResults) {
      if (!row.citations) continue;
      for (const raw of row.citations) {
        const domain = typeof raw === "string" ? null : raw.domain;
        if (domain) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }
    }
    const topCitedDomains = [...domainCounts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { prompts, shareOfVoice, perPrompt, contentGap, topCitedDomains, generatedFromRunAt: latestRows[0]!.runAt };
  });

  const brandShare = data.shareOfVoice.find((s) => s.isBrand)?.mentionPercent ?? null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.75in; }
          body { background: white; }
        }
        .report-page-break { break-before: page; }
      `}</style>

      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">AI Visibility Report</p>
        <div className="flex items-center gap-2">
          {isOwnerView ? <ReportShareButton projectId={projectId} /> : null}
          <ReportPrintButton />
        </div>
      </div>

      {/* Cover */}
      <div className="flex flex-col gap-2 border-b pb-8">
        <p className="text-sm font-medium text-muted-foreground">AI Visibility Report</p>
        <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground">{project.domain}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()}
          {data.generatedFromRunAt ? ` · latest tracking run ${data.generatedFromRunAt.toLocaleDateString()}` : ""}
        </p>
        {brandShare !== null ? (
          <div className="mt-4">
            <span className="text-5xl font-bold tabular-nums">{brandShare}%</span>
            <span className="ml-2 text-muted-foreground">overall Share of Voice</span>
          </div>
        ) : null}
      </div>

      {data.prompts.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No tracked prompts yet - add some on the Prompts page first.</p>
      ) : !data.generatedFromRunAt ? (
        <p className="mt-8 text-sm text-muted-foreground">No visibility runs yet - run a check on the Visibility page first.</p>
      ) : (
        <>
          {/* Share of Voice */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Competitive Landscape</h2>
            <p className="mb-3 text-sm text-muted-foreground">Real mention share from the most recent tracking run.</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Entity</th>
                  <th className="py-2 text-right font-medium">Mention %</th>
                </tr>
              </thead>
              <tbody>
                {data.shareOfVoice.map((s) => (
                  <tr key={s.entityDomain ?? "brand"} className="border-b last:border-0">
                    <td className="py-2">
                      {s.isBrand ? <strong>{project.name} (you)</strong> : s.entityDomain}
                    </td>
                    <td className="py-2 text-right tabular-nums">{s.mentionPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Per-prompt mention rate */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Mention Rate by Prompt</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Prompt</th>
                  <th className="py-2 text-right font-medium">Brand mention %</th>
                </tr>
              </thead>
              <tbody>
                {data.perPrompt.map((p) => (
                  <tr key={p.promptId} className="border-b last:border-0">
                    <td className="py-2">{p.promptText}</td>
                    <td className="py-2 text-right tabular-nums">{p.brandMentionPercent === null ? "—" : `${p.brandMentionPercent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Content gaps */}
          <section className="report-page-break mt-8">
            <h2 className="text-lg font-semibold">Content Gaps</h2>
            <p className="mb-3 text-sm text-muted-foreground">Prompts where a tracked competitor is mentioned but your brand isn&apos;t.</p>
            {data.contentGap.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content gaps in the latest run.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.contentGap.map((p) => (
                  <li key={p.promptId} className="border-b py-1.5 last:border-0">
                    {p.promptText}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Top cited domains */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Top AI-Cited Sources</h2>
            <p className="mb-3 text-sm text-muted-foreground">Domains AI assistants cite most often when answering your tracked prompts.</p>
            {data.topCitedDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No real citations captured yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Domain</th>
                    <th className="py-2 text-right font-medium">Times cited</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCitedDomains.map((d) => (
                    <tr key={d.domain} className="border-b last:border-0">
                      <td className="py-2">{d.domain}</td>
                      <td className="py-2 text-right tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
