"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The practical range users can actually pick in Custom Config - matches
// apps/web/lib/site-audit/start-site-audit.ts's own documented default
// (200). The server additionally hard-clamps to an absolute 100,000-page
// safety ceiling regardless of what's sent here (protects against a
// genuinely pathological site generating infinite faceted/calendar URLs),
// but that ceiling is deliberately never offered as a selectable value or
// sent as a default - previously it was both (a real bug: every one-click
// "Launch audit" used to crawl up to 100,000 real pages of a real
// third-party site, for up to 6 hours, caught by actually running one
// against linear.app and watching it climb past 1,000 pages with no sign
// of stopping).
const MIN_MAX_PAGES = 10;
const MAX_MAX_PAGES = 5_000;
const DEFAULT_MAX_PAGES = 200;

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
  const [customMaxPages, setCustomMaxPages] = useState(String(DEFAULT_MAX_PAGES));
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
          maxPages: showConfig ? Number(customMaxPages) || DEFAULT_MAX_PAGES : DEFAULT_MAX_PAGES,
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
              <div className="flex flex-col gap-2 w-full sm:w-1/4">
                <Label htmlFor="maxPages">Max pages to crawl</Label>
                <Input
                  id="maxPages"
                  type="number"
                  min={MIN_MAX_PAGES}
                  max={MAX_MAX_PAGES}
                  value={customMaxPages}
                  onChange={(e) => setCustomMaxPages(e.target.value)}
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
