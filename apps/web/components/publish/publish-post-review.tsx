"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { ScheduleAt } from "@/components/posts/schedule-at";
import type { BlogPostTargetView, BlogPostView } from "./types";

const STATUS_LABEL: Record<BlogPostTargetView["status"], string> = {
  pending: "Not sent yet",
  queued: "Queued",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
};

function TargetCard({
  projectId,
  postId,
  target,
  onChange,
}: {
  projectId: string;
  postId: string;
  target: BlogPostTargetView;
  onChange: (next: BlogPostTargetView) => void;
}) {
  const [isRespinning, setIsRespinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRespin() {
    setError(null);
    setIsRespinning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/blog/posts/${postId}/targets/${target.id}/respin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate a respin.");
      onChange({ ...target, adaptedTitle: data.target.adaptedTitle, adaptedBody: data.target.adaptedBody });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a respin.");
    } finally {
      setIsRespinning(false);
    }
  }

  const locked = target.status !== "pending";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{target.connectionLabel}</CardTitle>
          <CardDescription className="capitalize">{target.platform.replace(/_/g, " ")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {target.status === "published" && target.remoteUrl ? (
            <a href={target.remoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              View live <ExternalLink className="size-3" />
            </a>
          ) : (
            <Badge variant={target.status === "failed" ? "destructive" : target.status === "published" ? "success" : "secondary"}>{STATUS_LABEL[target.status]}</Badge>
          )}
          <Button type="button" variant="outline" size="sm" disabled={isRespinning || locked} onClick={handleRespin} className="gap-1.5">
            {isRespinning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Respin with AI
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input disabled={locked} value={target.adaptedTitle} onChange={(e) => onChange({ ...target, adaptedTitle: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Body</Label>
          <RichTextEditor
            editable={!locked}
            value={target.adaptedBody}
            onChange={(markdown) => onChange({ ...target, adaptedBody: markdown })}
          />
        </div>
        {target.failureReason ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{target.failureReason}</AlertTitle>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PublishPostReview({ projectId, post, initialTargets }: { projectId: string; post: BlogPostView; initialTargets: BlogPostTargetView[] }) {
  const [targets, setTargets] = useState(initialTargets);
  const [postStatus, setPostStatus] = useState(post.status);
  const [scheduledFor, setScheduledFor] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTarget(next: BlogPostTargetView) {
    setTargets((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }

  async function handlePublish(schedule: boolean) {
    setError(null);
    setIsPublishing(true);
    try {
      // Persist any manual edits to each target's respin content before
      // scheduling - the review textareas above are the only place these
      // can be changed, so send them along now rather than a separate save step.
      await Promise.all(
        targets.map((t) =>
          fetch(`/api/projects/${projectId}/blog/posts/${post.id}/targets/${t.id}/respin`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adaptedTitle: t.adaptedTitle, adaptedBody: t.adaptedBody }) }),
        ),
      );
      const res = await fetch(`/api/projects/${projectId}/blog/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't publish that post.");
      setPostStatus(schedule ? "scheduled" : "publishing");
      setTargets((prev) => prev.map((t) => ({ ...t, status: "queued" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish that post.");
    } finally {
      setIsPublishing(false);
    }
  }

  const allSent = targets.every((t) => t.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{post.title}</h2>
        <p className="text-sm text-muted-foreground capitalize">Status: {postStatus}</p>
      </div>

      {targets.map((target) => (
        <TargetCard key={target.id} projectId={projectId} postId={post.id} target={target} onChange={updateTarget} />
      ))}

      {!allSent ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            {error ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              <Button type="button" disabled={isPublishing} onClick={() => handlePublish(false)} className="gap-1.5 bg-publish text-publish-foreground hover:bg-publish/80">
                {isPublishing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Publish now
              </Button>
              <ScheduleAt value={scheduledFor} onChange={setScheduledFor} />
              <Button type="button" variant="outline" disabled={isPublishing || !scheduledFor} onClick={() => handlePublish(true)}>
                Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
