"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Check, Download, RefreshCw, Loader2, Radio, ExternalLink, Plug } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageAnalyzerResult } from "@/components/page-analyzer/analysis";

// Converts the full report to a clean Markdown string
function buildMarkdown(report: PageAnalyzerResult): string {
  const lines: string[] = [];
  const { crawl, coreWebVitals, keywordMetrics, comparisonRows, findings } = report;

  lines.push(`# SEO Report: ${report.url}`);
  lines.push(`**Target keyword:** ${report.targetKeyword}`);
  if (report.targetLocation) lines.push(`**Target location:** ${report.targetLocation}`);
  if (report.pageType) lines.push(`**Page type:** ${report.pageType.type} (${report.pageType.confidence} confidence)`);
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push("");

  const targetRow = comparisonRows.find((r) => r.isTarget);
  lines.push(
    targetRow?.position !== null && targetRow?.position !== undefined
      ? `**Real SERP ranking:** #${targetRow.position} in Google's real top 10 for "${report.targetKeyword}"`
      : `**Real SERP ranking:** Not in Google's real top 10 for "${report.targetKeyword}"`,
  );
  lines.push("");

  if (report.gscMetrics?.status === "connected" || report.ga4Metrics?.status === "connected") {
    lines.push("## Real Traffic (last 28 days)");
    lines.push("");
    if (report.gscMetrics?.status === "connected") {
      lines.push(
        `- **Search Console:** ${report.gscMetrics.totalClicks?.toLocaleString()} clicks, ${report.gscMetrics.totalImpressions?.toLocaleString()} impressions, ${((report.gscMetrics.avgCtr ?? 0) * 100).toFixed(1)}% CTR, avg. position ${(report.gscMetrics.avgPosition ?? 0).toFixed(1)}`,
      );
    }
    if (report.ga4Metrics?.status === "connected") {
      lines.push(
        `- **Analytics (organic):** ${report.ga4Metrics.sessions?.toLocaleString()} sessions, ${report.ga4Metrics.screenPageViews?.toLocaleString()} page views`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Crawl Findings");
  lines.push("");
  lines.push(`| Signal | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| HTTP status | ${crawl.statusCode || "Failed to fetch"} |`);
  lines.push(`| Title tag | ${crawl.title ?? "❌ Missing"} |`);
  lines.push(`| Meta description | ${crawl.metaDescription ? "✅ Present" : "❌ Missing"} |`);
  lines.push(`| H1 headings | ${crawl.h1Count} |`);
  lines.push(`| Word count | ${crawl.wordCount.toLocaleString()} |`);
  lines.push(`| Images missing alt text | ${crawl.imagesMissingAlt} / ${crawl.imageCount} |`);
  lines.push(`| Internal / external links | ${crawl.links.length} / ${crawl.externalLinkCount} |`);
  lines.push(`| Noindex | ${crawl.noindex ? "⚠️ Yes" : "No"} |`);
  lines.push(`| Load time | ${crawl.loadTimeMs}ms |`);
  if (coreWebVitals) {
    lines.push(`| LCP | ${coreWebVitals.lcp}s |`);
    lines.push(`| CLS | ${coreWebVitals.cls} |`);
    lines.push(`| INP | ${coreWebVitals.inp}ms |`);
  }
  if (keywordMetrics) {
    lines.push(`| Keyword search volume | ${keywordMetrics.searchVolume.toLocaleString()}/mo |`);
    lines.push(`| Keyword difficulty | ${keywordMetrics.difficulty}/100 |`);
    lines.push(`| Search intent | ${keywordMetrics.intent ?? "Unknown"} |`);
    lines.push(`| CPC | $${keywordMetrics.cpc.toFixed(2)} |`);
  } else {
    lines.push(`| Keyword metrics | Data not found (DataForSEO unavailable for this run) |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Competitor Comparison (SERP Top 10)");
  lines.push("");
  const hasSizing = comparisonRows.some((r) => !r.isTarget && r.strengthTier && r.strengthTier !== "unknown");
  if (hasSizing) {
    lines.push(`| SERP # | Domain | How beatable | Domain rating | Est. traffic | Words | H1s | Missing Alt | Load time |`);
    lines.push(`|---|---|---|---|---|---|---|---|---|`);
    for (const row of comparisonRows) {
      const pos = row.isTarget ? "Your page" : `#${row.position}`;
      const beatable = row.isTarget ? "—" : (row.strengthTier ?? "unknown");
      const rating = row.domainRating !== undefined ? row.domainRating : "—";
      const traffic = row.estimatedMonthlyTraffic !== undefined ? row.estimatedMonthlyTraffic.toLocaleString() : "—";
      lines.push(
        `| ${pos} | [${row.domain}](${row.url}) | ${beatable} | ${rating} | ${traffic} | ${row.wordCount.toLocaleString()} | ${row.h1Count} | ${row.imagesMissingAlt} | ${row.loadTimeMs.toLocaleString()}ms |`,
      );
    }
  } else {
    lines.push(`| SERP # | Domain | Words | H1s | Missing Alt | Load time |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const row of comparisonRows) {
      const pos = row.isTarget ? "Your page" : `#${row.position}`;
      lines.push(
        `| ${pos} | [${row.domain}](${row.url}) | ${row.wordCount.toLocaleString()} | ${row.h1Count} | ${row.imagesMissingAlt} | ${row.loadTimeMs.toLocaleString()}ms |`
      );
    }
  }
  lines.push("");

  const productRows = comparisonRows.filter((r) => r.jsonLdProduct);
  if (productRows.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Product Snapshot (real on-page product data)");
    lines.push("");
    lines.push(`| | Price | Rating | Availability | Brand |`);
    lines.push(`|---|---|---|---|---|`);
    for (const row of productRows) {
      const p = row.jsonLdProduct!;
      const who = row.isTarget ? "Your page" : row.domain;
      const price = p.price !== null ? `${p.priceCurrency ?? ""} ${p.price}`.trim() : "—";
      const rating = p.ratingValue !== null ? `${p.ratingValue}★${p.reviewCount !== null ? ` (${p.reviewCount})` : ""}` : "—";
      lines.push(`| ${who} | ${price} | ${rating} | ${p.availability ?? "—"} | ${p.brand ?? "—"} |`);
    }
    if (report.merchantMetrics?.status === "connected") {
      lines.push("");
      lines.push(
        `Real Merchant Center performance (last 28 days): ${report.merchantMetrics.totalClicks?.toLocaleString()} clicks, ${report.merchantMetrics.totalImpressions?.toLocaleString()} impressions, ${((report.merchantMetrics.avgCtr ?? 0) * 100).toFixed(1)}% CTR, ${report.merchantMetrics.totalConversions?.toLocaleString()} conversions.`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Fix-it Plan");
  lines.push("");

  if (findings.length === 0) {
    lines.push("No issues found by the automated checks. 🎉");
  } else {
    for (const finding of findings) {
      const impactEmoji = finding.impact === "High" ? "🔴" : finding.impact === "Medium" ? "🟡" : "🟢";
      lines.push(`### ${impactEmoji} ${finding.title}`);
      lines.push(`**Impact:** ${finding.impact}  |  **Category:** ${finding.category}`);
      lines.push("");
      lines.push(finding.description);
      lines.push("");
    }
  }

  if (report.keywordUsage) {
    const u = report.keywordUsage;
    lines.push("---");
    lines.push("");
    lines.push("## Target Keyword Usage");
    lines.push("");
    lines.push(`| Location | Present |`);
    lines.push(`|---|---|`);
    lines.push(`| Title | ${u.inTitle ? "✅" : "❌"} |`);
    lines.push(`| Meta description | ${u.inMetaDescription ? "✅" : "❌"} |`);
    lines.push(`| H1 | ${u.inH1 ? "✅" : "❌"} |`);
    lines.push(`| URL | ${u.inUrl ? "✅" : "❌"} |`);
    lines.push("");
    lines.push(`${u.occurrencesInBody} occurrence${u.occurrencesInBody === 1 ? "" : "s"} in the body text (${u.densityPercent}% density).`);
    lines.push("");
  }

  if (report.aiSuggestions) {
    const { rankingRecommendations, aiVisibilityRecommendations, keywordOpportunities, suggestedPrompts, model } = report.aiSuggestions;
    lines.push("---");
    lines.push("");
    lines.push(`## AI Guidance${model ? ` (${model})` : ""}`);
    lines.push("");

    if (rankingRecommendations.length > 0) {
      lines.push("### Rank higher on Google");
      lines.push("");
      for (const rec of rankingRecommendations) {
        lines.push(`- **${rec.title}** (${rec.priority} priority) — ${rec.why}`);
      }
      lines.push("");
    }

    if (aiVisibilityRecommendations.length > 0) {
      lines.push("### Get surfaced in AI answers");
      lines.push("");
      for (const rec of aiVisibilityRecommendations) {
        lines.push(`- **${rec.title}** (${rec.priority} priority) — ${rec.why}`);
      }
      lines.push("");
    }

    if (keywordOpportunities.length > 0) {
      lines.push("### Keyword Opportunities");
      lines.push("");
      lines.push(`| Keyword | Volume | Difficulty | CPC |`);
      lines.push(`|---|---|---|---|`);
      for (const k of keywordOpportunities) {
        lines.push(`| ${k.keyword} | ${k.searchVolume.toLocaleString()}/mo | ${k.difficulty}/100 | $${k.cpc.toFixed(2)} |`);
      }
      lines.push("");
    }

    if (suggestedPrompts.length > 0) {
      lines.push("### AI Overview & LLM Prompts");
      lines.push("");
      for (const p of suggestedPrompts) {
        lines.push(`- **${p.text}** — ${p.rationale}`);
      }
      lines.push("");
    }
  } else if (report.rankingGuidance || report.aiVisibilityGuidance) {
    lines.push("---");
    lines.push("");
    lines.push("## AI Guidance");
    lines.push("");
    if (report.rankingGuidance) {
      lines.push("### Rank higher on Google");
      lines.push("");
      lines.push(report.rankingGuidance);
      lines.push("");
    }
    if (report.aiVisibilityGuidance) {
      lines.push("### Get surfaced in AI answers");
      lines.push("");
      lines.push(report.aiVisibilityGuidance);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*Generated by RosterSEO — AI SEO & AI-Search Visibility Platform*");

  return lines.join("\n");
}

export function ReportExportBar({
  report,
  projectId,
  gscPropertyId,
}: {
  report: PageAnalyzerResult;
  projectId: string;
  gscPropertyId?: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isSubmittingBing, setIsSubmittingBing] = useState(false);
  const [bingResult, setBingResult] = useState<string | null>(null);
  const [bingError, setBingError] = useState<string | null>(null);

  const handleReanalyze = useCallback(async () => {
    setIsReanalyzing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-analyzer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: report.url, targetKeyword: report.targetKeyword, targetLocation: report.targetLocation ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reanalysis failed to start.");
      router.push(`/page-analyzer?reportId=${data.report.id}&tab=overview`);
    } catch (err) {
      console.error("page-analyzer reanalyze failed", err);
      setIsReanalyzing(false);
    }
  }, [projectId, report.url, report.targetKeyword, report.targetLocation, router]);

  // Real IndexNow submission (Bing/Yandex/Seznam/Naver) - same route Site
  // Audit's "Notify search engines" action uses, just scoped to this one
  // URL instead of a whole crawl's worth. Google has no equivalent
  // programmatic "request indexing" API for arbitrary sites - the button
  // below links to the real Search Console URL Inspection tool instead of
  // faking automation Google doesn't offer.
  const handleSubmitBing = useCallback(async () => {
    setIsSubmittingBing(true);
    setBingError(null);
    setBingResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/indexnow/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [report.url] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "indexnow_submit_failed" ? "Bing (IndexNow) rejected the submission." : "Submission failed.");
      setBingResult(`Submitted to Bing (IndexNow).`);
    } catch (err) {
      setBingError(err instanceof Error ? err.message : "Couldn't submit to Bing.");
    } finally {
      setIsSubmittingBing(false);
    }
  }, [projectId, report.url]);

  const gscInspectUrl = gscPropertyId
    ? `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(gscPropertyId)}&id=${encodeURIComponent(report.url)}`
    : null;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = buildMarkdown(report);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [report]);

  const handleDownloadPdf = useCallback(() => {
    // Trigger the browser print dialog — the print.css stylesheet
    // hides nav/sidebar so only the report content prints.
    window.print();
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Report ready — re-run, submit for indexing, or export.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={isReanalyzing} className="gap-1.5">
            {isReanalyzing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Reanalyze
          </Button>
          <Button variant="outline" size="sm" onClick={handleSubmitBing} disabled={isSubmittingBing} className="gap-1.5">
            {isSubmittingBing ? <Loader2 className="size-3.5 animate-spin" /> : <Radio className="size-3.5" />}
            Submit to Bing
          </Button>
          {gscInspectUrl ? (
            <a href={gscInspectUrl} target="_blank" rel="noreferrer noopener" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
              <ExternalLink className="size-3.5" />
              Request indexing in Google
            </a>
          ) : (
            <Link href="/integrations" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
              <Plug className="size-3.5" />
              Connect Search Console to index in Google
            </Link>
          )}
          <Button id="export-copy-markdown" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? "Copied!" : "Copy as Markdown"}
          </Button>
          <Button id="export-download-pdf" variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-1.5">
            <Download className="size-3.5" />
            Download PDF
          </Button>
        </div>
      </div>
      {bingResult ? <p className="text-xs text-success">{bingResult}</p> : null}
      {bingError ? <p className="text-xs text-destructive">{bingError}</p> : null}
    </div>
  );
}
