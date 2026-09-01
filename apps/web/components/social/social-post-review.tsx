"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ScheduleAt } from "@/components/posts/schedule-at";
import { SocialCharCounter } from "./social-char-counter";
import type { SocialPlatformDefView, SocialPostTargetView, SocialPostView } from "./types";

const STATUS_LABEL: Record<SocialPostTargetView["status"], string> = {
  pending: "Not sent yet",
  queued: "Queued",
  publishing: "Posting…",
  published: "Posted",
  failed: "Failed",
};

function TargetCard({
  projectId,
  postId,
  target,
  charLimit,
  onChange,
}: {
  projectId: string;
  postId: string;
  target: SocialPostTargetView;
  charLimit?: number;
  onChange: (next: SocialPostTargetView) => void;
}) {
  const [isRespinning, setIsRespinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRespin() {
    setError(null);
    setIsRespinning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/social/posts/${postId}/targets/${target.id}/respin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate a respin.");
      onChange({ ...target, adaptedBody: data.target.adaptedBody });
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
            <Badge
              variant={target.status === "failed" ? "destructive" : target.status === "published" ? "success" : target.status === "pending" ? "secondary" : "sky"}
            >
              {STATUS_LABEL[target.status]}
            </Badge>
          )}
          <Button type="button" variant="outline" size="sm" disabled={isRespinning || locked} onClick={handleRespin} className="gap-1.5">
            {isRespinning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Respin with AI
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea disabled={locked} rows={4} value={target.adaptedBody} onChange={(e) => onChange({ ...target, adaptedBody: e.target.value })} />
        <div className="flex justify-end">
          <SocialCharCounter length={target.adaptedBody.length} limit={charLimit} />
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

export function SocialPostReview({
  projectId,
  post,
  initialTargets,
  platforms,
}: {
  projectId: string;
  post: SocialPostView;
  initialTargets: SocialPostTargetView[];
  platforms: SocialPlatformDefView[];
}) {
  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const [targets, setTargets] = useState(initialTargets);
  const [postStatus, setPostStatus] = useState(post.status);
  const [scheduledFor, setScheduledFor] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTarget(next: SocialPostTargetView) {
    setTargets((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }

  async function handlePublish(schedule: boolean) {
    setError(null);
    setIsPublishing(true);
    try {
      await Promise.all(
        targets.map((t) =>
          fetch(`/api/projects/${projectId}/social/posts/${post.id}/targets/${t.id}/respin`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adaptedBody: t.adaptedBody }) }),
        ),
      );
      const res = await fetch(`/api/projects/${projectId}/social/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't post that.");
      setPostStatus(schedule ? "scheduled" : "publishing");
      setTargets((prev) => prev.map((t) => ({ ...t, status: "queued" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setIsPublishing(false);
    }
  }

  const allSent = targets.every((t) => t.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground capitalize">Status: {postStatus}</p>
      </div>

      {targets.map((target) => (
        <TargetCard
          key={target.id}
          projectId={projectId}
          postId={post.id}
          target={target}
          charLimit={platformById.get(target.platform)?.charLimit}
          onChange={updateTarget}
        />
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
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={isPublishing} onClick={() => handlePublish(false)} className="gap-1.5">
                {isPublishing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Post now
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
