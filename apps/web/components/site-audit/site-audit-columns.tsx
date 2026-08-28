"use client";

import { createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { SeverityBadge } from "@/components/site-audit/severity-badge";
import type { SiteAuditIssue } from "@/components/site-audit/audit-engine";

// Row shape for the issues table: a SiteAuditIssue plus the path portion of
// the URL split out, so the "Page" column can show something shorter than
// the full https://domain/... string while still sorting/filtering on it.
export type SiteAuditIssueRow = SiteAuditIssue & { path: string };

const columnHelper = createDataTableColumns<SiteAuditIssueRow>();

// Numeric rank so "Severity" sorts critical -> warning -> info instead of
// alphabetically (which would put critical before info before warning).
const SEVERITY_RANK: Record<SiteAuditIssue["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const siteAuditIssueColumns: DataTableColumnDef<SiteAuditIssueRow>[] = [
  columnHelper.accessor((row) => SEVERITY_RANK[row.severity], {
    id: "severity",
    header: "Severity",
    cell: (info) => <SeverityBadge severity={info.row.original.severity} />,
    sortFn: "alphanumeric",
  }),
  columnHelper.accessor("path", {
    id: "page",
    header: "Page",
    cell: (info) => <span className="font-mono text-xs text-foreground">{info.getValue()}</span>,
    sortFn: "text",
  }),
  columnHelper.accessor("category", {
    id: "category",
    header: "Category",
    sortFn: "text",
  }),
  columnHelper.accessor("description", {
    id: "description",
    header: "Issue",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
    sortFn: "text",
  }),
];
