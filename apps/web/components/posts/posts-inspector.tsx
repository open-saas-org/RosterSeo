"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PublishPostReview } from "@/components/publish/publish-post-review";
import { SocialPostReview } from "@/components/social/social-post-review";
import { SocialPostMetrics } from "@/components/social/social-post-metrics";
import type { BlogPostTargetView, BlogPostView } from "@/components/publish/types";
import type { SocialPlatformDefView, SocialPostTargetView, SocialPostView } from "@/components/social/types";

type BlogDetail = { post: BlogPostView; targets: BlogPostTargetView[] };
type SocialDetail = { post: SocialPostView; targets: SocialPostTargetView[]; platforms: SocialPlatformDefView[] };

// Shared side panel for both pillars - opened from a Posts-list row or the
// Up-next widget instead of a full page navigation to
// /publish/posts/:id or /social/posts/:id (those routes still work
// standalone, e.g. from a direct link/back button; this just gives the
// list a way to show the same review UI without leaving the list).
export function PostsInspector({
  postId,
  pillar,
  projectId,
  onClose,
}: {
  postId: string | null;
  pillar: "blog" | "social";
  projectId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<BlogDetail | SocialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) {
      setDetail(null);
      setError(null);
      return;
    }
    setDetail(null);
    setError(null);
    const path = pillar === "blog" ? `/api/projects/${projectId}/blog/posts/${postId}` : `/api/projects/${projectId}/social/posts/${postId}`;
    fetch(path)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load that post.");
        setDetail(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load that post."));
  }, [postId, pillar, projectId]);

  return (
    <Sheet open={postId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Review & publish</SheetTitle>
          <SheetDescription>AI-adapt each platform&apos;s version, edit anything you like, then publish now or schedule.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && !detail ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : null}
          {detail && pillar === "blog" ? (
            <PublishPostReview projectId={projectId} post={(detail as BlogDetail).post} initialTargets={(detail as BlogDetail).targets} />
          ) : null}
          {detail && pillar === "social" ? (
            <>
              <SocialPostReview
                projectId={projectId}
                post={(detail as SocialDetail).post}
                initialTargets={(detail as SocialDetail).targets}
                platforms={(detail as SocialDetail).platforms}
              />
              {(detail as SocialDetail).post.status === "published" || (detail as SocialDetail).post.status === "partial" ? (
                <SocialPostMetrics projectId={projectId} postId={(detail as SocialDetail).post.id} />
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
