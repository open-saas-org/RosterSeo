"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { AnalyzerForm, type AnalyzerFormInput } from "@/components/page-analyzer/analyzer-form";
import { PageTypeBadge } from "@/components/page-analyzer/page-type-badge";
import type { PageAnalyzerResult } from "@/components/page-analyzer/analysis";

type ReportHistoryRow = {
  id: string;
  url: string;
  targetKeyword: string;
  status: string;
  result: PageAnalyzerResult | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function PageAnalyzerWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data, isLoading: isHistoryLoading } = useSWR<{ reports: ReportHistoryRow[] }>(
    `/api/projects/${projectId}/page-analyzer`,
    fetcher,
  );
  const history = data?.reports ?? [];

  async function handleAnalyze(input: AnalyzerFormInput) {
    setError(null);
    setIsRunning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-analyzer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      router.push(`/page-analyzer?reportId=${data.report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong running this analysis.");
      setIsRunning(false);
    }
  }

  const historyColumns: DataTableColumnDef<ReportHistoryRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        return (
          <div className="flex flex-col">
            <span className="font-medium">{date.toLocaleDateString()}</span>
            <span className="text-xs text-muted-foreground">{date.toLocaleTimeString()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "url",
      header: "Page",
      cell: ({ row }) => <span className="truncate max-w-xs block">{row.original.url}</span>,
    },
    {
      accessorKey: "targetKeyword",
      header: "Target keyword",
    },
    {
      id: "pageType",
      header: "Page type",
      cell: ({ row }) =>
        row.original.result?.pageType ? <PageTypeBadge signal={row.original.result.pageType} /> : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "complete") return <span className="text-success font-medium">Complete</span>;
        if (s === "failed") return <span className="text-destructive font-medium">Failed</span>;
        return <span className="text-muted-foreground">Running</span>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const canView = row.original.status !== "failed";
        return (
          <div className="text-right">
            {canView ? (
              <Link href={`/page-analyzer?reportId=${row.original.id}`} className="text-sm font-medium text-primary hover:underline">
                View report &rarr;
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">View report &rarr;</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Page Analyzer"
        description="Crawl a page, compare it against the live top-10 SERP for your target keyword, and get a prioritized fix-it plan with AI-generated ranking and AI-visibility guidance."
      />

      <AnalyzerForm onAnalyze={handleAnalyze} isLoading={isRunning} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-medium">Previous reports</h3>

        {isHistoryLoading ? (
          <ListSkeleton rows={4} />
        ) : history.length === 0 ? (
          <EmptyState icon={Wand2} title="No past reports" description="Reports you run will show up here." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <DataTable columns={historyColumns} data={history} pageSize={10} emptyMessage="No reports found." bordered={false} />
          </div>
        )}
      </div>
    </div>
  );
}
