"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Mail, Search } from "lucide-react";
import { DataTable, createDataTableColumns, type DataTableColumnDef } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { BacklinkQualityBadge } from "@/components/backlinks/backlink-quality-badge";
import type { BacklinkItem } from "@rosterseo/dataforseo";

type LinkTypeFilter = "all" | "dofollow" | "nofollow";
type QualityFilter = "all" | "good" | "warning" | "spam";

function matchesQuality(item: BacklinkItem, filter: QualityFilter): boolean {
  if (filter === "all") return true;
  const isSpam = item.spamScore >= 30;
  const isWarning = !isSpam && (item.spamScore >= 10 || item.domainFromRank < 100);
  if (filter === "spam") return isSpam;
  if (filter === "warning") return isWarning;
  return !isSpam && !isWarning;
}

export function BacklinksTable({
  backlinks,
  projectId,
  onAddedToOutreach,
}: {
  backlinks: BacklinkItem[];
  projectId: string;
  onAddedToOutreach?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [linkType, setLinkType] = useState<LinkTypeFilter>("all");
  const [quality, setQuality] = useState<QualityFilter>("all");
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return backlinks.filter((item) => {
      if (linkType === "dofollow" && !item.dofollow) return false;
      if (linkType === "nofollow" && item.dofollow) return false;
      if (!matchesQuality(item, quality)) return false;
      if (needle && !item.domainFrom.toLowerCase().includes(needle) && !(item.anchor ?? "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [backlinks, search, linkType, quality]);

  async function addToOutreach(item: BacklinkItem) {
    setAddingUrl(item.urlFrom);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: item.domainFrom, sourceUrlFrom: item.urlFrom }),
      });
      if (res.ok) {
        setAddedUrls((prev) => new Set(prev).add(item.urlFrom));
        onAddedToOutreach?.();
      }
    } finally {
      setAddingUrl(null);
    }
  }

  const columns = createDataTableColumns<BacklinkItem>();
  const tableColumns: DataTableColumnDef<BacklinkItem>[] = [
    columns.accessor("domainFrom", {
      header: "Referring domain",
      cell: (info) => (
        <a href={info.row.original.urlFrom} target="_blank" rel="noreferrer noopener" className="font-medium hover:underline">
          {info.getValue()}
        </a>
      ),
      sortFn: "text",
    }),
    columns.accessor("anchor", {
      header: "Anchor text",
      cell: (info) => (
        <span className="block max-w-[220px] truncate text-muted-foreground" title={info.getValue() || undefined}>
          {info.getValue() || "—"}
        </span>
      ),
    }),
    columns.accessor("dofollow", {
      header: "Type",
      cell: (info) => (info.getValue() ? <Badge variant="outline">Dofollow</Badge> : <Badge variant="outline">Nofollow</Badge>),
    }),
    columns.accessor("domainFromRank", {
      header: "Domain rank",
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      sortFn: "alphanumeric",
    }),
    columns.accessor("spamScore", {
      header: "Quality",
      cell: (info) => <BacklinkQualityBadge spamScore={info.getValue()} domainFromRank={info.row.original.domainFromRank} />,
      sortFn: "alphanumeric",
    }),
    columns.accessor("lastSeen", {
      header: "Last seen",
      cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue() ?? "—"}</span>,
    }),
    columns.display({
      id: "outreach",
      header: "",
      cell: (info) => {
        const item = info.row.original;
        const added = addedUrls.has(item.urlFrom);
        return (
          <Button
            size="xs"
            variant={added ? "ghost" : "outline"}
            disabled={added || addingUrl === item.urlFrom}
            onClick={() => addToOutreach(item)}
            className="gap-1"
          >
            {addingUrl === item.urlFrom ? (
              <Loader2 className="size-3 animate-spin" />
            ) : added ? (
              <CheckCircle2 className="size-3 text-success" />
            ) : (
              <Mail className="size-3" />
            )}
            {added ? "Added" : "Add to Outreach"}
          </Button>
        );
      },
    }),
  ];

  if (backlinks.length === 0) {
    return <EmptyState icon={Search} title="No individual backlinks in this dataset" description="The backlink index for this domain only returned aggregate counts, not individual rows." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
        <div className="relative flex-1 min-w-40">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search domain or anchor text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 bg-background pl-8 text-sm"
          />
        </div>
        <FilterSelect
          value={linkType}
          onValueChange={(v) => setLinkType((v as LinkTypeFilter) ?? "all")}
          options={[
            { value: "all", label: "All links" },
            { value: "dofollow", label: "Dofollow" },
            { value: "nofollow", label: "Nofollow" },
          ]}
          triggerClassName="h-8 w-36"
        />
        <FilterSelect
          value={quality}
          onValueChange={(v) => setQuality((v as QualityFilter) ?? "all")}
          options={[
            { value: "all", label: "Any quality" },
            { value: "good", label: "Good only" },
            { value: "warning", label: "Low authority" },
            { value: "spam", label: "High spam risk" },
          ]}
          triggerClassName="h-8 w-44"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {backlinks.length}
        </span>
      </div>

      <DataTable columns={tableColumns} data={filtered} pageSize={15} emptyMessage="No backlinks match these filters." bordered />
    </div>
  );
}
