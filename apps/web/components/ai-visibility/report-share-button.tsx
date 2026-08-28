"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Real, revocable public link for this report - see ai_visibility_report_
// shares' schema comment and the report-share API route for how the link
// authorizes an anonymous visitor without ever giving them a real session.
// Lazily fetches the current share status the first time the dialog opens
// rather than on every report page load, since most visits are the
// owner's own (no need to check).
export function ReportShareButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/report-share`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't load share status.");
      setShareUrl(data.shareUrl);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load share status.");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !loaded) void loadStatus();
  }

  async function handleGenerate() {
    setIsWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/report-share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't create a share link.");
      setShareUrl(data.shareUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a share link.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke this share link? Anyone who has it will lose access immediately.")) return;
    setIsWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/report-share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't revoke the share link.");
      setShareUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke the share link.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) - the link
      // is still selectable from the input either way.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <Share2 className="size-4" />
        Share
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this report</DialogTitle>
          <DialogDescription>
            Anyone with this link can view this report - no login required. Revoke it anytime to cut off access.
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : shareUrl ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon-sm" onClick={handleCopy} className={copied ? "text-primary" : undefined}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              <span className="sr-only">Copy link</span>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active share link for this report yet.</p>
        )}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {loaded ? (
          <DialogFooter>
            {shareUrl ? (
              <>
                <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleRevoke} disabled={isWorking}>
                  <Trash2 className="size-3.5" />
                  Revoke
                </Button>
                <Button variant="outline" onClick={handleGenerate} disabled={isWorking}>
                  {isWorking ? <Loader2 className="size-4 animate-spin" /> : "Generate new link"}
                </Button>
              </>
            ) : (
              <Button onClick={handleGenerate} disabled={isWorking} className="gap-1.5">
                {isWorking ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-3.5" />}
                Create share link
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
