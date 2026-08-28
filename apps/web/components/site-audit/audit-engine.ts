// Shared site-audit types used by the client UI (site-audit-detail.tsx,
// site-audit-columns.tsx). The actual crawl + issue derivation + health
// score logic lives server-side in apps/worker/src/features/audit-runner.ts
// and crawler.ts, the only place that runs a real crawl.
export type IssueSeverity = "critical" | "warning" | "info";

export type SiteAuditIssue = {
  severity: IssueSeverity;
  category: string;
  url: string;
  description: string;
};
