"use client";

import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SiteAuditLaunchControl } from "@/components/site-audit/site-audit-launch-control";

// Shown only when this project has never run a site audit - everything
// after the first one lives on the single audit detail page (launching a
// new crawl, viewing results, recrawling pages) instead of a separate
// history/list page to jump back and forth to.
export function SiteAuditView({ project }: { project: { id: string; name: string; domain: string } }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Site Audit" description="Crawl a domain end-to-end and surface technical SEO issues, prioritized by severity." />

      <EmptyState
        icon={ListChecks}
        title="No audits yet"
        description={`Run your first audit to crawl ${project.domain} and see a prioritized list of technical SEO issues.`}
        action={<SiteAuditLaunchControl project={project} onLaunched={(auditId) => router.push(`/site-audit?auditId=${auditId}&tab=issues`)} />}
      />
    </div>
  );
}
