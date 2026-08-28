"use client";

import { useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// "Notify search engines (IndexNow)" action for the Site Audit results
// page - submits real crawled URLs (or manually entered ones) to Bing/
// Yandex/Seznam/Naver via the project's real IndexNow key (packages/indexnow,
// generated lazily by the submit route on first use).
export function IndexNowSubmitAction({ projectId, crawledUrls }: { projectId: string; crawledUrls: string[] }) {
  const [open, setOpen] = useState(false);
  const [manualUrls, setManualUrls] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(urls: string[]) {
    if (urls.length === 0) {
      setError("No URLs to submit.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/indexnow/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "indexnow_submit_failed" ? "IndexNow rejected the submission." : "All submitted URLs must share the same host.");
      setResult(`Submitted ${data.submitted} URL${data.submitted === 1 ? "" : "s"} to IndexNow.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit to IndexNow.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="gradient-teal" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Radio className="size-4" /> Notify search engines
      </Button>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Notify search engines (IndexNow)</CardTitle>
        <CardDescription>Push real URLs to Bing, Yandex, Seznam, and Naver so they crawl your latest changes sooner.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={isSubmitting || crawledUrls.length === 0} onClick={() => submit(crawledUrls)}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Submit all crawled URLs ({crawledUrls.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Or submit specific URLs (one per line):</p>
          <Textarea
            value={manualUrls}
            onChange={(e) => setManualUrls(e.target.value)}
            placeholder="https://example.com/page-1&#10;https://example.com/page-2"
            rows={4}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={isSubmitting}
            onClick={() => submit(manualUrls.split("\n").map((u) => u.trim()).filter(Boolean))}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Submit these URLs
          </Button>
        </div>
        {result ? <p className="text-sm text-success">{result}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
