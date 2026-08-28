"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A hard safety ceiling, not a user-facing feature - a real crawl always
// runs to completion (BFS frontier exhausted or the wall-clock deadline in
// apps/worker's crawler.ts, whichever's first), never stopped early by a
// page count. This just protects against a genuinely pathological site
// (e.g. infinite faceted/calendar URL generation) from growing the link
// graph without bound - no real site's actual page count comes close.
const MAX_PAGES_SAFETY_CEILING = 100_000;

// Launch-a-new-crawl control: the button + Custom Config form, shared by
// the empty state (a project's very first audit) and the audit detail
// page's own "New audit" toggle - one real implementation instead of the
// launch flow only existing on a page users have to navigate away from
// their results to reach.
export function SiteAuditLaunchControl({
  project,
  onLaunched,
  buttonLabel = "Launch audit",
}: {
  project: { id: string; domain: string };
  onLaunched: (auditId: string) => void;
  buttonLabel?: string;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState("");
  const [customSitemap, setCustomSitemap] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  async function handleRunAudit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    setIsRunning(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}/site-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: customDomain || project.domain,
          customSitemapUrl: customSitemap || undefined,
          maxPages: MAX_PAGES_SAFETY_CEILING,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to start audit");
      }

      const { auditId } = await res.json();
      onLaunched(auditId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The audit failed to complete. Try again.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setShowConfig(!showConfig)}>
          {showConfig ? "Hide Config" : "Custom Config"}
        </Button>
        <Button onClick={handleRunAudit} disabled={isRunning}>
          {isRunning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Crawling…
            </>
          ) : (
            <>
              <RefreshCcw className="size-4" />
              {buttonLabel}
            </>
          )}
        </Button>
      </div>

      {showConfig && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleRunAudit} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <Label htmlFor="domain">Target Domain</Label>
                <Input
                  id="domain"
                  placeholder={project.domain}
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                <Label htmlFor="sitemap">Custom Sitemap URL (Optional)</Label>
                <Input
                  id="sitemap"
                  placeholder={`https://${project.domain}/sitemap.xml`}
                  value={customSitemap}
                  onChange={(e) => setCustomSitemap(e.target.value)}
                />
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Audit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
