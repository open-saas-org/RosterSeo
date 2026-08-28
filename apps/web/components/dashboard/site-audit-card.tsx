import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type IssueGroup = { category: string; severity: "critical" | "warning" | "info"; count: number };

const SEVERITY_DOT: Record<IssueGroup["severity"], string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

function healthScoreTone(score: number): "success" | "warning" | "destructive" {
  if (score >= 50) return "success";
  if (score >= 20) return "warning";
  return "destructive";
}

export function SiteAuditCard({
  hasRunBefore,
  healthScore,
  pagesCrawled,
  completedAt,
  topIssueGroups,
  remainingIssueCount,
}: {
  hasRunBefore: boolean;
  healthScore: number | null;
  pagesCrawled: number;
  completedAt: string | null;
  topIssueGroups: IssueGroup[];
  remainingIssueCount: number;
}) {
  // Total across every category, not just the top 3 shown - the headline
  // number for the dashboard's single most-actionable card, so it earns
  // the same primary-color treatment as AI Visibility's score cards.
  const totalIssues = topIssueGroups.reduce((sum, g) => sum + g.count, 0) + remainingIssueCount;
  const tone = healthScore !== null ? healthScoreTone(healthScore) : "success";
  const toneClass = { success: "text-success", warning: "text-warning", destructive: "text-destructive" }[tone];

  const card = (
    <Card interactive={hasRunBefore} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-seo" />
          <CardTitle className="text-base font-semibold">Site audit</CardTitle>
        </div>
        {hasRunBefore ? (
          <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover/card:text-primary" />
        ) : null}
      </CardHeader>
      <CardContent>
        {!hasRunBefore ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Run a site audit to see crawl health and issues here.</p>
            <Link href="/site-audit" className={cn(buttonVariants({ size: "sm" }))}>
              Run a site audit
            </Link>
          </div>
        ) : topIssueGroups.length === 0 ? (
          <div className="flex flex-col gap-2">
            {healthScore !== null ? (
              <div className="flex items-baseline gap-2 rounded-md bg-success/5 px-3 py-2">
                <span className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{healthScore}</span>
                <span className="text-sm text-muted-foreground">/100 health score</span>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">No issues found on the latest crawl.</p>
            <p className="text-xs text-muted-foreground">
              Site audit · crawled {pagesCrawled} pages{completedAt ? ` · ${new Date(completedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {healthScore !== null ? (
                <div className={cn("flex items-baseline gap-1.5 rounded-md px-3 py-2", tone === "success" ? "bg-success/5" : tone === "warning" ? "bg-warning/5" : "bg-destructive/5")}>
                  <span className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{healthScore}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              ) : null}
              <div className="flex items-baseline gap-2 rounded-md bg-primary/5 px-3 py-2">
                <span className="text-2xl font-semibold tabular-nums text-primary">{totalIssues}</span>
                <span className="text-sm text-muted-foreground">open issue{totalIssues === 1 ? "" : "s"}</span>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {topIssueGroups.map((group) => (
                <li key={group.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", SEVERITY_DOT[group.severity])} />
                    {group.category}
                  </span>
                  <span className="text-muted-foreground">
                    {group.count} issue{group.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
            {remainingIssueCount > 0 ? (
              <p className="text-sm text-muted-foreground">+{remainingIssueCount} more issues</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Site audit · crawled {pagesCrawled} pages{completedAt ? ` · ${new Date(completedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return hasRunBefore ? (
    <Link href="/site-audit" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
