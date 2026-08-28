"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, RefreshCw, Search, SquareArrowOutUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterSelect } from "@/components/ui/filter-select";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { cn } from "@/lib/utils";

export type AuditPageRow = {
  id: string;
  url: string;
  statusCode: number;
  title: string | null;
  wordCount: number;
  crawlDepth: number;
  canonicalUrl: string | null;
  metaRobots: string | null;
  redirectedTo: string | null;
  h2Texts: string[] | null;
  action: string;
  notes: string | null;
};

type PageMetrics = {
  gscConnected: boolean;
  ga4Connected: boolean;
  gscByPath: Record<string, { impressions: number; clicks: number; ctr: number; position: number }>;
  ga4ByPath: Record<string, { sessions: number; engagementRate: number }>;
};

function toPathKey(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p || "/";
  } catch {
    return url;
  }
}

const ACTION_LABELS: Record<string, string> = { no_action: "No action", in_progress: "In progress", fixed: "Fixed" };

type Indexability = { label: string; variant: "success" | "warning" | "destructive" | "info" };

function toPath(url: string, domain: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const withoutDomain = withoutScheme.startsWith(domain) ? withoutScheme.slice(domain.length) : withoutScheme;
  return withoutDomain === "" ? "/" : withoutDomain;
}

function isNoindex(metaRobots: string | null): boolean {
  return !!metaRobots && /noindex/i.test(metaRobots);
}

function getIndexability(page: AuditPageRow): Indexability {
  if (page.statusCode === 0) return { label: "Error", variant: "destructive" };
  if (page.statusCode >= 500) return { label: "Server error", variant: "destructive" };
  if (page.statusCode >= 400) return { label: "Not found", variant: "destructive" };
  if (page.statusCode >= 300) return { label: "Redirected", variant: "info" };
  if (isNoindex(page.metaRobots)) return { label: "Noindex", variant: "warning" };
  if (page.canonicalUrl && page.canonicalUrl !== page.url) return { label: "Canonicalized", variant: "warning" };
  return { label: "Indexable", variant: "success" };
}

function toCsvCell(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function NotesCell({ page, onSave }: { page: AuditPageRow; onSave: (value: string) => void }) {
  const [value, setValue] = useState(page.notes ?? "");
  return (
    <Input
      value={value}
      placeholder="Add note..."
      className="h-7 min-w-[140px] text-xs"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (page.notes ?? "")) onSave(value);
      }}
    />
  );
}

export function SiteAuditPagesTable({
  auditId,
  projectId,
  domain,
  pages: initialPages,
  search = "",
}: {
  auditId: string;
  projectId: string;
  domain: string;
  pages: AuditPageRow[];
  search?: string;
}) {
  const [pages, setPages] = useState(initialPages);
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [noindexOnly, setNoindexOnly] = useState(false);
  const [deepOnly, setDeepOnly] = useState(false);
  const [thinOnly, setThinOnly] = useState(false);
  const [redirectsOnly, setRedirectsOnly] = useState(false);
  const [recrawlingId, setRecrawlingId] = useState<string | null>(null);

  // Real per-page GSC/GA4 metrics, fetched once and joined onto the crawl
  // data client-side by path - see the route for why (no fabricated data
  // when a project has neither connected; `gscConnected`/`ga4Connected`
  // tell the columns below whether to show real zeros or "-").
  const { data: metrics } = useQuery<PageMetrics>({
    queryKey: ["site-audit-page-metrics", projectId, auditId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/site-audit/${auditId}/page-metrics`);
      if (!res.ok) throw new Error("Failed to load page metrics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  function updatePage(id: string, patch: Partial<AuditPageRow>) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function saveAction(pageId: string, action: string) {
    const previous = pages.find((p) => p.id === pageId)?.action;
    updatePage(pageId, { action });
    const res = await fetch(`/api/projects/${projectId}/site-audit/${auditId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    // Revert the optimistic update on failure so the UI never shows a
    // value that isn't actually in the database - a silent failure here
    // would look "saved" until the next reload wipes it out.
    if (!res.ok && previous !== undefined) updatePage(pageId, { action: previous });
  }

  async function saveNotes(pageId: string, notes: string) {
    const previous = pages.find((p) => p.id === pageId)?.notes ?? null;
    updatePage(pageId, { notes: notes || null });
    const res = await fetch(`/api/projects/${projectId}/site-audit/${auditId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) updatePage(pageId, { notes: previous });
  }

  async function recrawl(pageId: string) {
    setRecrawlingId(pageId);
    try {
      const res = await fetch(`/api/projects/${projectId}/site-audit/${auditId}/pages/${pageId}/recrawl`, { method: "POST" });
      if (res.ok) {
        const { page } = await res.json();
        updatePage(pageId, page);
      }
    } finally {
      setRecrawlingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => {
      if (q && !p.url.toLowerCase().includes(q) && !(p.title ?? "").toLowerCase().includes(q)) return false;
      if (statusFilter !== "all") {
        const bucket = p.statusCode === 0 ? "error" : `${Math.floor(p.statusCode / 100)}xx`;
        if (bucket !== statusFilter) return false;
      }
      if (actionFilter !== "all" && p.action !== actionFilter) return false;
      if (noindexOnly && !isNoindex(p.metaRobots)) return false;
      if (deepOnly && p.crawlDepth <= 3) return false;
      if (thinOnly && p.wordCount >= 100) return false;
      if (redirectsOnly && !p.redirectedTo) return false;
      return true;
    });
  }, [pages, search, statusFilter, actionFilter, noindexOnly, deepOnly, thinOnly, redirectsOnly]);

  function exportCsv() {
    downloadCsv(`site-audit-${auditId}-pages.csv`, [
      [
        "URL", "Status", "Indexability", "Title", "Crawl Depth", "Word Count", "H2-1", "H2-2", "Canonical", "Meta Robots", "Redirects To",
        "Impressions", "Clicks", "CTR", "Position", "Sessions", "Engagement Rate", "Action", "Notes",
      ],
      ...filtered.map((p) => {
        const gsc = metrics?.gscConnected ? metrics.gscByPath[toPathKey(p.url)] : undefined;
        const ga4 = metrics?.ga4Connected ? metrics.ga4ByPath[toPathKey(p.url)] : undefined;
        return [
          p.url,
          p.statusCode,
          getIndexability(p).label,
          p.title ?? "",
          p.crawlDepth,
          p.wordCount,
          p.h2Texts?.[0] ?? "",
          p.h2Texts?.[1] ?? "",
          p.canonicalUrl ?? "",
          p.metaRobots ?? "",
          p.redirectedTo ?? "",
          gsc?.impressions ?? "",
          gsc?.clicks ?? "",
          gsc ? `${(gsc.ctr * 100).toFixed(1)}%` : "",
          gsc ? gsc.position.toFixed(1) : "",
          ga4?.sessions ?? "",
          ga4 ? `${(ga4.engagementRate * 100).toFixed(1)}%` : "",
          ACTION_LABELS[p.action] ?? p.action,
          p.notes ?? "",
        ];
      }),
    ]);
  }

  const columns: DataTableColumnDef<AuditPageRow>[] = [
    {
      id: "details",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <IconButton icon={SquareArrowOutUpRight} label="View page details" render={<Link href={`/site-audit/${auditId}/pages/${row.original.id}`} />} />
          <IconButton
            icon={recrawlingId === row.original.id ? Loader2 : RefreshCw}
            label="Recrawl this page"
            className={recrawlingId === row.original.id ? "[&_svg]:animate-spin" : undefined}
            disabled={recrawlingId === row.original.id}
            onClick={() => recrawl(row.original.id)}
          />
        </div>
      ),
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => (
        <a href={row.original.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
          <span className="max-w-[260px] truncate">{toPath(row.original.url, domain)}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ),
    },
    {
      accessorKey: "statusCode",
      header: "Status",
      cell: ({ row }) => {
        const code = row.original.statusCode;
        if (code === 0) return <Badge variant="destructive">Error</Badge>;
        if (code < 300) return <Badge variant="success">{code}</Badge>;
        if (code < 400) return <Badge variant="info">{code}</Badge>;
        return <Badge variant="destructive">{code}</Badge>;
      },
    },
    {
      id: "indexability",
      header: "Indexability",
      cell: ({ row }) => {
        const idx = getIndexability(row.original);
        return <Badge variant={idx.variant}>{idx.label}</Badge>;
      },
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <span className="block max-w-[240px] truncate">{row.original.title || "-"}</span>,
    },
    { accessorKey: "crawlDepth", header: "Depth" },
    { accessorKey: "wordCount", header: "Words" },
    {
      id: "h2-1",
      header: "H2-1",
      cell: ({ row }) => <span className="block max-w-[180px] truncate text-muted-foreground">{row.original.h2Texts?.[0] || "-"}</span>,
    },
    {
      id: "h2-2",
      header: "H2-2",
      cell: ({ row }) => <span className="block max-w-[180px] truncate text-muted-foreground">{row.original.h2Texts?.[1] || "-"}</span>,
    },
    {
      accessorKey: "canonicalUrl",
      header: "Canonical",
      cell: ({ row }) => {
        const c = row.original.canonicalUrl;
        if (!c) return <span className="text-muted-foreground">-</span>;
        const mismatched = c !== row.original.url;
        return <span className={cn("block max-w-[200px] truncate", mismatched && "text-warning")}>{toPath(c, domain)}</span>;
      },
    },
    {
      accessorKey: "metaRobots",
      header: "Meta Robots",
      cell: ({ row }) => <span className="block max-w-[180px] truncate text-muted-foreground">{row.original.metaRobots || "-"}</span>,
    },
    {
      accessorKey: "redirectedTo",
      header: "Redirects To",
      cell: ({ row }) => (row.original.redirectedTo ? <span className="block max-w-[200px] truncate">{toPath(row.original.redirectedTo, domain)}</span> : <span className="text-muted-foreground">-</span>),
    },
    {
      id: "impressions",
      header: "Impressions",
      // accessorFn is what makes a column sortable (DataTable's header only
      // shows the sort toggle when column.getCanSort() finds one) - these
      // columns join in react-query data by URL rather than reading
      // row.original directly, so they need it added explicitly instead of
      // getting it for free from an accessorKey.
      accessorFn: (row) => (metrics?.gscConnected ? (metrics.gscByPath[toPathKey(row.url)]?.impressions ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.gscConnected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.gscByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? m.impressions.toLocaleString() : "-"}</span>;
      },
    },
    {
      id: "clicks",
      header: "Clicks",
      accessorFn: (row) => (metrics?.gscConnected ? (metrics.gscByPath[toPathKey(row.url)]?.clicks ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.gscConnected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.gscByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? m.clicks.toLocaleString() : "-"}</span>;
      },
    },
    {
      id: "ctr",
      header: "CTR",
      accessorFn: (row) => (metrics?.gscConnected ? (metrics.gscByPath[toPathKey(row.url)]?.ctr ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.gscConnected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.gscByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? `${(m.ctr * 100).toFixed(1)}%` : "-"}</span>;
      },
    },
    {
      id: "position",
      header: "Position",
      accessorFn: (row) => (metrics?.gscConnected ? (metrics.gscByPath[toPathKey(row.url)]?.position ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.gscConnected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.gscByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? m.position.toFixed(1) : "-"}</span>;
      },
    },
    {
      id: "sessions",
      header: "Sessions",
      accessorFn: (row) => (metrics?.ga4Connected ? (metrics.ga4ByPath[toPathKey(row.url)]?.sessions ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.ga4Connected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.ga4ByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? m.sessions.toLocaleString() : "-"}</span>;
      },
    },
    {
      id: "engagementRate",
      header: "Engagement Rate",
      accessorFn: (row) => (metrics?.ga4Connected ? (metrics.ga4ByPath[toPathKey(row.url)]?.engagementRate ?? -1) : -1),
      sortFn: "alphanumeric",
      cell: ({ row }) => {
        if (!metrics?.ga4Connected) return <span className="text-muted-foreground">-</span>;
        const m = metrics.ga4ByPath[toPathKey(row.original.url)];
        return <span className="tabular-nums">{m ? `${(m.engagementRate * 100).toFixed(1)}%` : "-"}</span>;
      },
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <Select
          value={row.original.action}
          onValueChange={(v) => v && saveAction(row.original.id, v)}
          items={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "notes",
      header: "Notes",
      // key={row.original.id}, not just row.id (the table's own row key) -
      // DataTable's default row ids are positional ("0", "1", ...) into the
      // current filtered/sorted data array, not the real page id. Typing in
      // the search box or toggling a filter reshuffles which real page sits
      // at a given position, and without this key NotesCell's uncontrolled
      // <Input> would keep showing/editing the PREVIOUS page's stale note
      // text under the new row - and could silently save it onto the wrong
      // page on blur.
      cell: ({ row }) => <NotesCell key={row.original.id} page={row.original} onSave={(value) => saveNotes(row.original.id, value)} />,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Own toolbar row for this tab's filters (status/action/noindex/etc. -
          the shared tab header above only carries the search box), styled
          the same "border-b p-3" divider the app already uses elsewhere
          (e.g. keyword-research-table.tsx's stat panel) so it reads as one
          seam, not a padded box nested inside the outer bordered unit. */}
      <div className="flex flex-wrap items-center gap-4 border-b p-3">
        <FilterSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: "all", label: "All status codes" },
            { value: "2xx", label: "2xx" },
            { value: "3xx", label: "3xx" },
            { value: "4xx", label: "4xx" },
            { value: "5xx", label: "5xx" },
            { value: "error", label: "Error" },
          ]}
          triggerClassName="w-40"
        />
        <FilterSelect
          value={actionFilter}
          onValueChange={setActionFilter}
          options={[{ value: "all", label: "All actions" }, ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))]}
          triggerClassName="w-40"
        />
        <Button variant={noindexOnly ? "default" : "outline"} size="sm" className="rounded-[10px]" onClick={() => setNoindexOnly((v) => !v)}>
          Noindex
        </Button>
        <Button variant={deepOnly ? "default" : "outline"} size="sm" className="rounded-[10px]" onClick={() => setDeepOnly((v) => !v)}>
          Depth &gt; 3
        </Button>
        <Button variant={thinOnly ? "default" : "outline"} size="sm" className="rounded-[10px]" onClick={() => setThinOnly((v) => !v)}>
          &lt;100 words
        </Button>
        <Button variant={redirectsOnly ? "default" : "outline"} size="sm" className="rounded-[10px]" onClick={() => setRedirectsOnly((v) => !v)}>
          Redirects only
        </Button>
        <span className="text-sm text-muted-foreground">{filtered.length} pages</span>
        <Button variant="soft-indigo" size="sm" className="ml-auto gap-2" onClick={exportCsv}>
          <Download className="size-4" /> CSV
        </Button>
      </div>

      <DataTable columns={columns} data={filtered} pageSize={25} emptyMessage="No pages match these filters." bordered={false} />
    </div>
  );
}
