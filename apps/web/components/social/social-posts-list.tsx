"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { PostCalendar, type CalendarEvent } from "@/components/posts/post-calendar";
import { PostsInspector } from "@/components/posts/posts-inspector";
import { BulkActionsBar } from "@/components/posts/bulk-actions-bar";
import { cn } from "@/lib/utils";
import type { SocialPostView } from "./types";

const STATUS_VARIANT: Record<SocialPostView["status"], "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  scheduled: "warning",
  publishing: "warning",
  published: "success",
  partial: "destructive",
  failed: "destructive",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "publishing", label: "Publishing" },
  { value: "published", label: "Published" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];

// useSearchParams (for ?highlight=) requires a Suspense boundary - see
// oauth-status-banner.tsx's identical pattern/comment.
export function SocialPostsList(props: { projectId: string; posts: SocialPostView[] }) {
  return (
    <Suspense fallback={null}>
      <SocialPostsListInner {...props} />
    </Suspense>
  );
}

function SocialPostsListInner({ projectId, posts }: { projectId: string; posts: SocialPostView[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightParam = searchParams.get("highlight");

  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectorPostId, setInspectorPostId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightParam);

  useEffect(() => {
    if (highlightParam) {
      router.replace("/social/posts", { scroll: false });
      const timeout = setTimeout(() => setHighlightedId(null), 1500);
      return () => clearTimeout(timeout);
    }
  }, [highlightParam, router]);

  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts) for (const platform of post.platforms) set.add(platform);
    return [{ value: "all", label: "All platforms" }, ...Array.from(set).map((p) => ({ value: p, label: p.replace(/_/g, " ") }))];
  }, [posts]);

  const filteredPosts = useMemo(
    () =>
      posts.filter((post) => {
        if (statusFilter !== "all" && post.status !== statusFilter) return false;
        if (platformFilter !== "all" && !post.platforms.includes(platformFilter)) return false;
        return true;
      }),
    [posts, statusFilter, platformFilter],
  );

  if (posts.length === 0) {
    return <EmptyState icon={Share2} graphic="social" title="No posts yet" description="Compose your first post to see it here." />;
  }

  const events: CalendarEvent[] = filteredPosts.map((post) => ({
    id: post.id,
    href: `/social/posts/${post.id}`,
    title: post.body,
    date: new Date(post.scheduledFor ?? post.createdAt),
    status: post.status,
    platforms: post.platforms,
  }));

  const allSelected = filteredPosts.length > 0 && filteredPosts.every((p) => selectedIds.has(p.id));

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filteredPosts.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    await fetch(`/api/projects/${projectId}/social/posts/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    router.refresh();
  }

  async function handleBulkReschedule(scheduledFor: string) {
    await fetch(`/api/projects/${projectId}/social/posts/bulk-reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), scheduledFor }),
    });
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <Tabs defaultValue="list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All statuses" />
          <FilterSelect value={platformFilter} onValueChange={setPlatformFilter} options={platformOptions} placeholder="All platforms" />
        </div>
      </div>
      <TabsContent value="list" className="mt-3">
        <BulkActionsBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} onDelete={handleBulkDelete} onReschedule={handleBulkReschedule} />
        {filteredPosts.length > 0 ? (
          <div className="mb-2 flex items-center gap-2 px-1">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {filteredPosts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No posts match these filters.</p> : null}
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50",
                highlightedId === post.id && "border-primary/40 bg-primary/5",
              )}
            >
              <Checkbox checked={selectedIds.has(post.id)} onCheckedChange={() => toggleOne(post.id)} aria-label="Select post" />
              <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left" onClick={() => setInspectorPostId(post.id)}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{post.body}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{post.status === "scheduled" && post.scheduledFor ? `Scheduled for ${new Date(post.scheduledFor).toLocaleString()}` : new Date(post.createdAt).toLocaleDateString()}</span>
                    {post.platforms.map((platform) => (
                      <Badge key={platform} variant="outline" className="capitalize">
                        {platform.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[post.status]} className="shrink-0 capitalize">
                  {post.status}
                </Badge>
              </button>
            </div>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="calendar" className="mt-3">
        <PostCalendar
          events={events}
          pillar="social"
          projectId={projectId}
          onSelectPost={setInspectorPostId}
          onRescheduled={() => router.refresh()}
        />
      </TabsContent>
      <PostsInspector postId={inspectorPostId} pillar="social" projectId={projectId} onClose={() => setInspectorPostId(null)} />
    </Tabs>
  );
}
