// Shared, framework-free report-building logic for the Page Analyzer.
//
// This is intentionally not a React component even though it lives under
// components/page-analyzer/ - it's the one piece of logic both the page and
// the API route need identically, so it's kept here rather than duplicated.
//
// Fully real pipeline: fetchAndParse (real fetch + cheerio, shared with
// Site Audit via @rosterseo/crawler), real DataForSEO SERP + keyword data,
// real Google PageSpeed Core Web Vitals for the target page, and real LLM
// guidance (when a provider is configured) - no mock data anywhere in this
// file.
import { fetchAndParse, detectPageType, type CrawledPageResult, type PageTypeSignal, type ProductJsonLd } from "@rosterseo/crawler";
import {
  getRealKeywordMetrics,
  getRealSerpResults,
  type KeywordMetrics,
  type SerpResult,
} from "@rosterseo/dataforseo";
import {
  getSearchConsolePageMetrics,
  getGA4PageMetrics,
  getMerchantProductPerformanceForProduct,
  type SearchConsolePageMetrics,
  type GA4PageMetrics,
} from "@rosterseo/google";
import { fetchPageSpeedMetrics, type PageSpeedMetrics } from "@rosterseo/google/pagespeed";
import {
  generatePageAnalysisAi,
  type PageAnalysisRecommendation,
  type SuggestedPrompt,
} from "@rosterseo/ai-visibility";
import type { DomainSnapshot } from "@/lib/domain-snapshot";

export type FindingImpact = "High" | "Medium" | "Low";
export type FindingCategory = "Technical" | "Content" | "Structure" | "Indexability";

export type Finding = {
  id: string;
  title: string;
  description: string;
  impact: FindingImpact;
  category: FindingCategory;
};

// Simple, disclosed banding vs. the target's own domain rating - never an
// opaque score. "unknown" means sizing wasn't attempted for this row (past
// the top-6 cap, or the real DataForSEO lookup failed) so the UI never
// implies "similar" for a domain that was never actually checked.
export type CompetitorStrengthTier = "smaller" | "similar" | "bigger" | "much-bigger" | "unknown";

export type CompetitorComparisonRow = {
  id: string;
  position: number | null;
  domain: string;
  url: string;
  title: string | null;
  wordCount: number;
  h1Count: number;
  imagesMissingAlt: number;
  loadTimeMs: number;
  isTarget: boolean;
  // Real on-page schema.org Product data for this row's own URL (target or
  // competitor alike) - present whenever that page declares one, regardless
  // of the overall page type, so a product-vs-product comparison works even
  // if e.g. the target is a category page linking to product rows.
  jsonLdProduct?: ProductJsonLd | null;
  // Real DataForSEO domain-authority sizing (resolveDomainSnapshot,
  // apps/web/lib/domain-snapshot.ts) - absent when sizing wasn't resolved
  // for this row (see strengthTier "unknown" above).
  domainRating?: number;
  estimatedMonthlyTraffic?: number;
  organicKeywords?: number;
  strengthTier?: CompetitorStrengthTier;
};

export type KeywordUsageCheck = {
  inTitle: boolean;
  inMetaDescription: boolean;
  inH1: boolean;
  inUrl: boolean;
  occurrencesInBody: number;
  densityPercent: number;
};

export type PageAnalysisAiSuggestions = {
  rankingRecommendations: PageAnalysisRecommendation[];
  aiVisibilityRecommendations: PageAnalysisRecommendation[];
  keywordOpportunities: KeywordMetrics[];
  suggestedPrompts: SuggestedPrompt[];
  model?: string;
};

// "not_connected": the project has no GSC/GA4 connection (or no
// property picked) for this metric to come from.
// "no_data": real connection, real call, zero rows for this exact URL.
// "error": the real API call itself failed (token/quota/network).
// "connected": real data came back below.
export type PageMetricsStatus = "connected" | "not_connected" | "no_data" | "error";

export type PageAnalyzerGscMetrics = { status: PageMetricsStatus } & Partial<SearchConsolePageMetrics>;
export type PageAnalyzerGa4Metrics = { status: PageMetricsStatus } & Partial<GA4PageMetrics>;
// Real per-product Merchant Center performance (getMerchantProductPerformanceForProduct,
// @rosterseo/google), matched by the page's own declared product name -
// "not_connected" covers both "no Merchant Center connected" and "this
// isn't a product page" (the caller never attempts the lookup in the
// latter case), never fabricated either way.
export type PageAnalyzerMerchantMetrics = { status: PageMetricsStatus } & Partial<{
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  totalConversions: number;
}>;

export type PageAnalyzerResult = {
  url: string;
  targetKeyword: string;
  targetLocation: string | null;
  crawl: CrawledPageResult;
  // Real, rule-based (detectPageType, @rosterseo/crawler) - never an AI
  // guess. Optional: reports generated before this field existed have
  // none - render an honest "unknown" state, never guess retroactively.
  pageType?: PageTypeSignal;
  coreWebVitals: PageSpeedMetrics | null;
  // Real DataForSEO data only, never mock/fabricated - null means DataForSEO
  // wasn't configured or the real call failed for this run, not that the
  // keyword genuinely has zero volume. Every renderer must show an honest
  // "data not found" state rather than a zeroed-out metric.
  keywordMetrics: KeywordMetrics | null;
  serpResults: SerpResult[];
  comparisonRows: CompetitorComparisonRow[];
  findings: Finding[];
  keywordUsage?: KeywordUsageCheck;
  aiSuggestions?: PageAnalysisAiSuggestions | null;
  // Set only when aiSuggestions is null/absent on a report generated after
  // this field existed - distinguishes "OpenRouter isn't configured" from
  // "a real call was made and failed" so the UI never conflates the two.
  aiUnavailableReason?: "not_configured" | "failed";
  gscMetrics?: PageAnalyzerGscMetrics;
  ga4Metrics?: PageAnalyzerGa4Metrics;
  merchantMetrics?: PageAnalyzerMerchantMetrics;
  // Legacy fields from before the structured-AI rebuild - old stored
  // reports may still have these and nothing else AI-related. Kept
  // optional/typed (not deleted) purely so old history rows still render
  // instead of crashing; new reports never set them.
  rankingGuidance?: string | null;
  aiVisibilityGuidance?: string | null;
  guidanceProvider?: string | null;
  generatedAt: string;
};

const IMPACT_ORDER: Record<FindingImpact, number> = { High: 0, Medium: 1, Low: 2 };

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// host+path, lowercased, www-stripped, trailing-slash-stripped - loose
// enough to match "https://example.com/page" against "example.com/page/"
// while still being a real identity check (not fuzzy string similarity).
function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Rule-based findings derived directly from the real crawl (+ real Core Web
// Vitals, when available) - every finding here traces back to a genuine
// signal, nothing fabricated or LLM-generated.
export function generateFindings(
  crawl: CrawledPageResult,
  competitorCrawls: CrawledPageResult[],
  coreWebVitals: PageSpeedMetrics | null,
): Finding[] {
  const findings: Finding[] = [];
  const avgCompetitorWordCount = average(competitorCrawls.map((c) => c.wordCount));

  if (crawl.statusCode === 0) {
    findings.push({
      id: "fetch-failed",
      title: "Page could not be fetched",
      description: `The crawler could not reach this URL${crawl.fetchError ? ` (${crawl.fetchError})` : ""}. Nothing else below can be trusted until this is fixed.`,
      impact: "High",
      category: "Technical",
    });
    return findings;
  }

  if (crawl.statusCode >= 400) {
    findings.push({
      id: "broken-status",
      title: `Page returns HTTP ${crawl.statusCode}`,
      description: "Search engines can't rank a page they can't successfully fetch. Fix the underlying error before anything else here matters.",
      impact: "High",
      category: "Technical",
    });
  }

  if (crawl.redirectedTo) {
    findings.push({
      id: "redirected",
      title: "URL redirects before rendering",
      description: `This URL redirects to ${crawl.redirectedTo}. Analyze and target the final URL directly, or fix the redirect if it's unintentional.`,
      impact: "Low",
      category: "Technical",
    });
  }

  if (crawl.noindex) {
    findings.push({
      id: "noindex",
      title: "Page is marked noindex",
      description: "A noindex directive tells Google not to show this page in search results at all - no other fix here matters until this is removed.",
      impact: "High",
      category: "Indexability",
    });
  }

  if (crawl.canonicalUrl) {
    const canonicalNormalized = crawl.canonicalUrl.replace(/\/$/, "");
    const pageNormalized = crawl.url.replace(/\/$/, "");
    if (canonicalNormalized !== pageNormalized) {
      findings.push({
        id: "canonical-mismatch",
        title: "Canonical URL points elsewhere",
        description: `This page's canonical tag points to ${crawl.canonicalUrl}, telling Google to rank that URL instead of this one. Confirm this is intentional.`,
        impact: "Medium",
        category: "Indexability",
      });
    }
  }

  if (!crawl.title) {
    findings.push({
      id: "missing-title",
      title: "Missing title tag",
      description:
        "The page has no <title> element. Search engines rely on it heavily for both ranking and the SERP snippet headline.",
      impact: "High",
      category: "Technical",
    });
  }

  if (!crawl.metaDescription) {
    findings.push({
      id: "missing-meta-description",
      title: "Missing meta description",
      description:
        "No meta description found. Without one, Google writes its own snippet, which usually hurts click-through rate.",
      impact: "High",
      category: "Technical",
    });
  }

  if (crawl.h1Count === 0) {
    findings.push({
      id: "missing-h1",
      title: "No H1 heading found",
      description: "Every indexable page should have exactly one H1 that states the page's primary topic.",
      impact: "High",
      category: "Structure",
    });
  } else if (crawl.h1Count > 1) {
    findings.push({
      id: "multiple-h1",
      title: `${crawl.h1Count} H1 headings found`,
      description: "Multiple H1s dilute topical focus and confuse the heading hierarchy. Use exactly one per page.",
      impact: "Medium",
      category: "Structure",
    });
  }

  if (crawl.wordCount < 500) {
    findings.push({
      id: "thin-content",
      title: "Thin content",
      description: `The page has only ${crawl.wordCount} words${
        avgCompetitorWordCount ? `, versus a ${Math.round(avgCompetitorWordCount)}-word average among the top-ranking pages` : ""
      }. Expand coverage of the topic before expecting it to compete.`,
      impact: "High",
      category: "Content",
    });
  } else if (avgCompetitorWordCount && crawl.wordCount < avgCompetitorWordCount * 0.7) {
    findings.push({
      id: "content-depth-gap",
      title: "Content depth gap vs. competitors",
      description: `Top-ranking competitors average ${Math.round(avgCompetitorWordCount)} words; this page has ${crawl.wordCount}. Consider covering more subtopics.`,
      impact: "Medium",
      category: "Content",
    });
  }

  if (crawl.imagesMissingAlt > 0) {
    findings.push({
      id: "missing-alt-text",
      title: `${crawl.imagesMissingAlt} image${crawl.imagesMissingAlt === 1 ? "" : "s"} missing alt text`,
      description: "Alt text helps both accessibility and image-search rankings. Add descriptive alt text to every content image.",
      impact: crawl.imagesMissingAlt > 3 ? "Medium" : "Low",
      category: "Technical",
    });
  }

  if (crawl.loadTimeMs > 2500) {
    findings.push({
      id: "slow-load-time",
      title: "Slow load time",
      description: `Page load took ${crawl.loadTimeMs}ms. Aim for well under 2500ms to avoid ranking and conversion penalties.`,
      impact: crawl.loadTimeMs > 4000 ? "High" : "Medium",
      category: "Technical",
    });
  }

  if (coreWebVitals) {
    if (coreWebVitals.lcp > 2.5) {
      findings.push({
        id: "lcp",
        title: "Largest Contentful Paint (LCP) needs improvement",
        description: `LCP is ${coreWebVitals.lcp}s; Google's "good" threshold is 2.5s.`,
        impact: coreWebVitals.lcp > 4 ? "High" : "Medium",
        category: "Technical",
      });
    }

    if (coreWebVitals.cls > 0.1) {
      findings.push({
        id: "cls",
        title: "Cumulative Layout Shift (CLS) needs improvement",
        description: `CLS is ${coreWebVitals.cls}; Google's "good" threshold is 0.1.`,
        impact: coreWebVitals.cls > 0.25 ? "High" : "Medium",
        category: "Technical",
      });
    }

    if (coreWebVitals.inp > 200) {
      findings.push({
        id: "inp",
        title: "Interaction to Next Paint (INP) needs improvement",
        description: `INP is ${coreWebVitals.inp}ms; Google's "good" threshold is 200ms.`,
        impact: coreWebVitals.inp > 500 ? "High" : "Medium",
        category: "Technical",
      });
    }
  }

  if (crawl.links.length < 3) {
    findings.push({
      id: "low-internal-links",
      title: "Few internal links",
      description: `Only ${crawl.links.length} internal link${crawl.links.length === 1 ? "" : "s"} found. Internal linking helps search engines discover and understand how pages relate.`,
      impact: "Low",
      category: "Structure",
    });
  }

  return findings.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
}

// The target page is only ever a REAL entry in the top-10 comparison if it
// actually appears among the real SERP results DataForSEO returned - never
// synthesized. When it does appear, its real SERP position is used and the
// duplicate competitor row for that same URL is dropped (so the page isn't
// listed twice); when it doesn't, `position` stays null and the UI is
// responsible for rendering that as "not ranking in the top 10," not as a
// blank/ambiguous cell.
export function buildComparisonRows(
  target: { url: string; crawl: CrawledPageResult },
  competitors: { serp: SerpResult; crawl: CrawledPageResult }[],
): CompetitorComparisonRow[] {
  const targetNorm = normalizeUrlForCompare(target.url);
  const matched = competitors.find(({ serp }) => normalizeUrlForCompare(serp.url) === targetNorm);
  const rest = matched ? competitors.filter((c) => c !== matched) : competitors;

  return [
    {
      id: "target",
      position: matched?.serp.position ?? null,
      domain: hostnameOf(target.url),
      url: target.url,
      title: target.crawl.title,
      wordCount: target.crawl.wordCount,
      h1Count: target.crawl.h1Count,
      imagesMissingAlt: target.crawl.imagesMissingAlt,
      loadTimeMs: target.crawl.loadTimeMs,
      isTarget: true,
      jsonLdProduct: target.crawl.jsonLdProduct,
    },
    ...rest.map(({ serp, crawl }) => ({
      id: `competitor-${serp.position}`,
      position: serp.position,
      domain: serp.domain,
      url: serp.url,
      title: crawl.title,
      wordCount: crawl.wordCount,
      h1Count: crawl.h1Count,
      imagesMissingAlt: crawl.imagesMissingAlt,
      loadTimeMs: crawl.loadTimeMs,
      isTarget: false,
      jsonLdProduct: crawl.jsonLdProduct,
    })),
  ];
}

function summarizeCrawlForPrompt(crawl: CrawledPageResult, coreWebVitals: PageSpeedMetrics | null): string {
  const lines = [
    `Title: ${crawl.title ?? "MISSING"}`,
    `Meta description: ${crawl.metaDescription ?? "MISSING"}`,
    `H1 count: ${crawl.h1Count}`,
    `Word count: ${crawl.wordCount}`,
    `Images missing alt text: ${crawl.imagesMissingAlt} of ${crawl.imageCount}`,
    `Internal links: ${crawl.links.length}, external links: ${crawl.externalLinkCount}`,
    `HTTP status: ${crawl.statusCode}${crawl.redirectedTo ? ` (redirects to ${crawl.redirectedTo})` : ""}`,
    `Noindex: ${crawl.noindex ? "yes" : "no"}`,
  ];
  if (coreWebVitals) {
    lines.push(`Core Web Vitals: LCP ${coreWebVitals.lcp}s, CLS ${coreWebVitals.cls}, INP ${coreWebVitals.inp}ms`);
  }
  return lines.join("\n");
}

function summarizeKeywordForPrompt(metrics: KeywordMetrics | null): string {
  if (!metrics) return "Real keyword metrics unavailable for this run - do not invent volume/difficulty/CPC numbers.";
  return `Search volume: ${metrics.searchVolume.toLocaleString()}/mo, Difficulty: ${metrics.difficulty}/100, CPC: $${metrics.cpc.toFixed(2)}, Search intent: ${metrics.intent ?? "unknown"}`;
}

function summarizeCompetitorsForPrompt(rows: CompetitorComparisonRow[]): string {
  return rows
    .filter((row) => !row.isTarget)
    .map(
      (row) =>
        `#${row.position} ${row.domain} - ${row.wordCount.toLocaleString()} words, ${row.h1Count} H1s, ${row.imagesMissingAlt} images missing alt`,
    )
    .join("\n");
}

function summarizePageTypeForPrompt(signal: PageTypeSignal): string {
  return `Page type: ${signal.type} (${signal.confidence} confidence - ${signal.reasons.join("; ")})`;
}

const STRENGTH_TIER_LABEL: Record<Exclude<CompetitorStrengthTier, "unknown">, string> = {
  smaller: "smaller than you - a strong near-term target",
  similar: "similar size to you - a realistic near-term target",
  bigger: "bigger than you - a longer-term target",
  "much-bigger": "much bigger than you - unlikely to outrank near-term",
};

// Empty string (not a placeholder sentence) when no row got sized - lets
// buildPrompt skip the whole section rather than show a hollow header.
function summarizeCompetitorStrengthForPrompt(rows: CompetitorComparisonRow[]): string {
  const sized = rows.filter(
    (row): row is CompetitorComparisonRow & { strengthTier: Exclude<CompetitorStrengthTier, "unknown"> } =>
      !row.isTarget && !!row.strengthTier && row.strengthTier !== "unknown",
  );
  if (!sized.length) return "";
  return sized
    .map(
      (row) =>
        `#${row.position} ${row.domain} - domain rating ${row.domainRating}, ${(row.organicKeywords ?? 0).toLocaleString()} organic keywords, ~${(row.estimatedMonthlyTraffic ?? 0).toLocaleString()} est. monthly traffic - ${STRENGTH_TIER_LABEL[row.strengthTier]}`,
    )
    .join("\n");
}

// Simple, disclosed banding vs. the target's own real domain rating - see
// CompetitorStrengthTier's doc comment. `null` targetRating (sizing wasn't
// resolved for the target itself) always yields "unknown", never a guess.
function computeStrengthTier(targetRating: number | null, competitorRating: number): CompetitorStrengthTier {
  if (targetRating === null) return "unknown";
  if (competitorRating < targetRating) return "smaller";
  if (competitorRating - targetRating <= 15) return "similar";
  if (competitorRating <= targetRating * 2) return "bigger";
  return "much-bigger";
}

// Caps real DataForSEO domain-authority lookups at the top 6 unique
// competitor domains (confirmed decision - bounds worst-case cost/latency
// on a cold cache) plus the target's own domain unconditionally, since
// every strengthTier is computed relative to it. Cached results (7-day
// window, apps/web/lib/domain-snapshot.ts) make repeat domains across
// future reports free - only genuinely new domains pay for a real lookup.
const MAX_SIZED_COMPETITORS = 6;

async function sizeCompetitors(
  rows: CompetitorComparisonRow[],
  resolveDomainSnapshot: (domain: string) => Promise<DomainSnapshot | null>,
): Promise<CompetitorComparisonRow[]> {
  const target = rows.find((row) => row.isTarget);
  const targetSnapshot = target ? await resolveDomainSnapshot(target.domain).catch(() => null) : null;

  const competitorDomains = [...new Set(rows.filter((row) => !row.isTarget).map((row) => row.domain))].slice(0, MAX_SIZED_COMPETITORS);
  const sizedByDomain = new Map<string, DomainSnapshot | null>();
  await Promise.all(
    competitorDomains.map(async (domain) => {
      sizedByDomain.set(domain, await resolveDomainSnapshot(domain).catch(() => null));
    }),
  );

  return rows.map((row) => {
    if (row.isTarget) {
      return targetSnapshot
        ? {
            ...row,
            domainRating: targetSnapshot.domainRating,
            estimatedMonthlyTraffic: targetSnapshot.estimatedMonthlyTraffic,
            organicKeywords: targetSnapshot.organicKeywords,
          }
        : row;
    }
    const snapshot = sizedByDomain.get(row.domain);
    if (!snapshot) return { ...row, strengthTier: "unknown" as const };
    return {
      ...row,
      domainRating: snapshot.domainRating,
      estimatedMonthlyTraffic: snapshot.estimatedMonthlyTraffic,
      organicKeywords: snapshot.organicKeywords,
      strengthTier: computeStrengthTier(targetSnapshot?.domainRating ?? null, snapshot.domainRating),
    };
  });
}

// Real, deterministic check of whether the target keyword actually appears
// on the page - no AI involved. Needs fetchAndParse's captureContent:true
// (bodyText/h1Text), unlike everything else in this file which only needs
// the default derived counts.
export function checkKeywordUsage(crawl: CrawledPageResult, targetKeyword: string): KeywordUsageCheck {
  const needle = targetKeyword.trim().toLowerCase();
  const inTitle = !!crawl.title && crawl.title.toLowerCase().includes(needle);
  const inMetaDescription = !!crawl.metaDescription && crawl.metaDescription.toLowerCase().includes(needle);
  const inH1 = (crawl.h1Text ?? []).some((h) => h.toLowerCase().includes(needle));
  const inUrl = crawl.url.toLowerCase().includes(needle.replace(/\s+/g, "-")) || crawl.url.toLowerCase().includes(needle);

  const body = (crawl.bodyText ?? "").toLowerCase();
  const needleWords = needle.split(/\s+/).filter(Boolean);
  let occurrencesInBody = 0;
  if (needle && body) {
    let idx = 0;
    while (true) {
      const found = body.indexOf(needle, idx);
      if (found === -1) break;
      occurrencesInBody++;
      idx = found + needle.length;
    }
  }
  const densityPercent = crawl.wordCount > 0 ? Math.round(((occurrencesInBody * needleWords.length) / crawl.wordCount) * 1000) / 10 : 0;

  return { inTitle, inMetaDescription, inH1, inUrl, occurrencesInBody, densityPercent };
}

function summarizeKeywordUsageForPrompt(usage: KeywordUsageCheck): string {
  return `In title: ${usage.inTitle ? "yes" : "no"}, in meta description: ${usage.inMetaDescription ? "yes" : "no"}, in H1: ${usage.inH1 ? "yes" : "no"}, in URL: ${usage.inUrl ? "yes" : "no"}, occurrences in body: ${usage.occurrencesInBody} (density ${usage.densityPercent}%)`;
}

// Caps how many AI-proposed candidate phrases get a real DataForSEO lookup
// - the schema already asks for 6-10, this is just a hard ceiling.
const MAX_KEYWORD_OPPORTUNITIES = 10;

async function enrichKeywordOpportunities(candidates: string[]): Promise<KeywordMetrics[]> {
  const unique = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_KEYWORD_OPPORTUNITIES);
  const results = await Promise.all(unique.map((candidate) => getRealKeywordMetrics(candidate)));
  // Real numbers only - a candidate DataForSEO couldn't return real data
  // for is dropped, never fabricated (getRealKeywordMetrics has no mock
  // fallback, unlike getKeywordMetrics used elsewhere in this file for the
  // target keyword itself).
  return results.filter((r): r is KeywordMetrics => r !== null);
}

const GSC_GA4_WINDOW_DAYS = 28;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchGscPageMetrics(gsc: { accessToken: string; siteUrl: string } | null | undefined, pageUrl: string): Promise<PageAnalyzerGscMetrics> {
  if (!gsc) return { status: "not_connected" };
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - GSC_GA4_WINDOW_DAYS);
    const metrics = await getSearchConsolePageMetrics(gsc.accessToken, gsc.siteUrl, pageUrl, isoDate(start), isoDate(end));
    if (metrics.totalImpressions === 0 && metrics.topQueries.length === 0) return { status: "no_data" };
    return { status: "connected", ...metrics };
  } catch (err) {
    console.error("[page-analyzer] getSearchConsolePageMetrics failed:", err);
    return { status: "error" };
  }
}

// Only called when detectPageType already said "product" for this run - a
// non-product page never attempts this lookup at all, not even to report
// "not_connected", since the question doesn't apply to it.
async function fetchMerchantMetrics(
  merchant: { accessToken: string; merchantAccountId: string } | null | undefined,
  productName: string | null,
): Promise<PageAnalyzerMerchantMetrics> {
  if (!merchant) return { status: "not_connected" };
  if (!productName) return { status: "no_data" };
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - GSC_GA4_WINDOW_DAYS);
    const rows = await getMerchantProductPerformanceForProduct(merchant.accessToken, merchant.merchantAccountId, productName, isoDate(start), isoDate(end));
    if (rows.length === 0) return { status: "no_data" };
    const totals = rows.reduce(
      (acc, row) => ({
        clicks: acc.clicks + row.clicks,
        impressions: acc.impressions + row.impressions,
        conversions: acc.conversions + row.conversions,
      }),
      { clicks: 0, impressions: 0, conversions: 0 },
    );
    return {
      status: "connected",
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      avgCtr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      totalConversions: totals.conversions,
    };
  } catch (err) {
    console.error("[page-analyzer] getMerchantProductPerformanceForProduct failed:", err);
    return { status: "error" };
  }
}

async function fetchGa4PageMetrics(ga4: { accessToken: string; propertyId: string } | null | undefined, pagePath: string): Promise<PageAnalyzerGa4Metrics> {
  if (!ga4) return { status: "not_connected" };
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - GSC_GA4_WINDOW_DAYS);
    const metrics = await getGA4PageMetrics(ga4.accessToken, ga4.propertyId, pagePath, isoDate(start), isoDate(end));
    if (!metrics) return { status: "no_data" };
    return { status: "connected", ...metrics };
  } catch (err) {
    console.error("[page-analyzer] getGA4PageMetrics failed:", err);
    return { status: "error" };
  }
}

// Orchestrates every real data source: fetchAndParse for the target page and
// every SERP competitor (concurrent), real Google PageSpeed for the target
// page only (Lighthouse is too slow to run for all 10 competitors inline),
// real DataForSEO SERP + keyword data, and - last, since it needs
// everything else's output - real LLM guidance when a provider is
// configured.
export async function buildPageAnalyzerResult(input: {
  url: string;
  targetKeyword: string;
  targetLocation?: string;
  // Real, already-refreshed access tokens + the project's picked
  // GSC/GA4 property, resolved by the API route (which has DB/session
  // access this framework-free module deliberately doesn't). `null`/
  // `undefined` means "not connected" - never faked.
  gsc?: { accessToken: string; siteUrl: string } | null;
  ga4?: { accessToken: string; propertyId: string } | null;
  merchant?: { accessToken: string; merchantAccountId: string } | null;
  // Injected resolver, not a pre-resolved value like gsc/ga4 above - the
  // competitor domains this needs aren't known until getRealSerpResults
  // runs below, so the API route (which has DB access) hands in a closure
  // over projectId/userId instead (apps/web/lib/domain-snapshot.ts).
  // Omitted entirely = no competitor-strength sizing for this run (e.g. a
  // caller with no project context), never a fake "unknown" tier flood.
  resolveDomainSnapshot?: (domain: string) => Promise<DomainSnapshot | null>;
}): Promise<PageAnalyzerResult> {
  const { url, targetKeyword, targetLocation, gsc, ga4, merchant, resolveDomainSnapshot } = input;
  const pagePath = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();

  const [crawl, realSerpResults, keywordMetrics, gscMetrics, ga4Metrics] = await Promise.all([
    fetchAndParse(url, { captureContent: true }),
    getRealSerpResults(targetKeyword, targetLocation || undefined),
    getRealKeywordMetrics(targetKeyword),
    fetchGscPageMetrics(gsc, url),
    fetchGa4PageMetrics(ga4, pagePath),
  ]);
  // Real DataForSEO SERP results only - null (unconfigured/failed) becomes
  // an empty competitor set rather than fabricated competitor-###.com
  // domains, since this report headlines the comparison as "Google's real
  // top 10."
  const serpResults = realSerpResults ?? [];

  const pageType = detectPageType(crawl, url);

  const [competitorCrawls, coreWebVitals, merchantMetrics] = await Promise.all([
    Promise.all(serpResults.map(async (serp) => ({ serp, crawl: await fetchAndParse(serp.url, { captureContent: true }) }))),
    fetchPageSpeedMetrics(url).catch(() => null),
    pageType.type === "product" ? fetchMerchantMetrics(merchant, crawl.jsonLdProduct?.name ?? null) : Promise.resolve<PageAnalyzerMerchantMetrics>({ status: "not_connected" }),
  ]);

  let comparisonRows = buildComparisonRows({ url, crawl }, competitorCrawls);
  if (resolveDomainSnapshot) {
    comparisonRows = await sizeCompetitors(comparisonRows, resolveDomainSnapshot);
  }
  const findings = generateFindings(
    crawl,
    competitorCrawls.map((c) => c.crawl),
    coreWebVitals,
  );
  const keywordUsage = checkKeywordUsage(crawl, targetKeyword);

  const ai = await generatePageAnalysisAi({
    url,
    targetKeyword,
    crawlSummary: summarizeCrawlForPrompt(crawl, coreWebVitals),
    keywordSummary: summarizeKeywordForPrompt(keywordMetrics),
    competitorSummary: summarizeCompetitorsForPrompt(comparisonRows),
    keywordUsageSummary: summarizeKeywordUsageForPrompt(keywordUsage),
    pageTypeSummary: summarizePageTypeForPrompt(pageType),
    competitorStrengthSummary: summarizeCompetitorStrengthForPrompt(comparisonRows),
  });

  let aiSuggestions: PageAnalysisAiSuggestions | null = null;
  let aiUnavailableReason: "not_configured" | "failed" | undefined;
  if (ai.status === "ok") {
    aiSuggestions = {
      rankingRecommendations: ai.result.rankingRecommendations,
      aiVisibilityRecommendations: ai.result.aiVisibilityRecommendations,
      keywordOpportunities: await enrichKeywordOpportunities(ai.result.keywordOpportunities),
      suggestedPrompts: ai.result.suggestedPrompts,
      model: ai.model,
    };
  } else {
    aiUnavailableReason = ai.status;
  }

  return {
    url,
    targetKeyword,
    targetLocation: targetLocation ?? null,
    crawl,
    pageType,
    coreWebVitals,
    keywordMetrics,
    serpResults,
    comparisonRows,
    findings,
    keywordUsage,
    aiSuggestions,
    aiUnavailableReason,
    gscMetrics,
    ga4Metrics,
    merchantMetrics,
    generatedAt: new Date().toISOString(),
  };
}
