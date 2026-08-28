import type { CrawledPageResult } from "./fetch-and-parse";

// Pure page-level issue derivation, shared by Site Audit's full crawl
// (apps/worker/src/features/audit-runner.ts) and the per-page recrawl API
// route (apps/web) - one real implementation, so re-checking a single page
// after you've fixed it produces the exact same issues a full re-crawl
// would, not a second copy that can drift.
export type IssueSeverity = "critical" | "warning" | "info";

export interface DerivedIssue {
  severity: IssueSeverity;
  category: string;
  description: string;
}

export function deriveIssues(page: CrawledPageResult): DerivedIssue[] {
  const issues: DerivedIssue[] = [];
  const push = (severity: IssueSeverity, category: string, description: string) =>
    issues.push({ severity, category, description });

  if (page.statusCode === 0) {
    push("critical", "Links", `Failed to fetch (${page.fetchError ?? "unknown error"})`);
    return issues;
  }

  if (page.statusCode >= 400) {
    push("critical", "Links", `Broken page (HTTP ${page.statusCode})`);
  }

  if (page.redirectedTo) {
    push("info", "Redirects", `Redirects to ${page.redirectedTo}`);
  }

  if (page.statusCode < 400) {
    if (page.metaDescription === null) {
      push("critical", "Meta", "Missing meta description");
    }

    if (page.h1Count === 0) {
      push("critical", "Content", "Missing H1 tag");
    } else if (page.h1Count > 1) {
      push("warning", "Content", `Multiple H1 tags (${page.h1Count} found)`);
    }

    if (page.imagesMissingAlt > 0) {
      push(
        "warning",
        "Accessibility",
        `${page.imagesMissingAlt} image${page.imagesMissingAlt === 1 ? "" : "s"} missing alt text`,
      );
    }

    if (page.loadTimeMs > 2500) {
      push("warning", "Performance", `Slow page load (${page.loadTimeMs.toLocaleString()}ms)`);
    }

    if (page.wordCount < 300) {
      push("info", "Content", `Thin content (${page.wordCount} words)`);
    }

    if (page.noindex) {
      push("warning", "Indexability", "Page is marked noindex");
    }
  }

  return issues;
}
