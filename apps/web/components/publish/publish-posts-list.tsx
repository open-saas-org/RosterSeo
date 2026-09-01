import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PostCalendar, type CalendarEvent } from "@/components/posts/post-calendar";
import type { BlogPostView } from "./types";

const STATUS_VARIANT: Record<BlogPostView["status"], "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  scheduled: "warning",
  publishing: "warning",
  published: "success",
  partial: "destructive",
  failed: "destructive",
};

export function PublishPostsList({ posts }: { posts: BlogPostView[] }) {
  if (posts.length === 0) {
    return <EmptyState icon={Newspaper} title="No posts yet" description="Compose your first post to see it here." />;
  }

  const events: CalendarEvent[] = posts.map((post) => ({
    id: post.id,
    href: `/publish/posts/${post.id}`,
    title: post.title,
    date: new Date(post.scheduledFor ?? post.createdAt),
    status: post.status,
  }));

  return (
    <Tabs defaultValue="list">
      <TabsList>
        <TabsTrigger value="list">List</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="mt-3">
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <Link key={post.id} href={`/publish/posts/${post.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-publish/30 hover:bg-muted/50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{post.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {post.status === "scheduled" && post.scheduledFor ? `Scheduled for ${new Date(post.scheduledFor).toLocaleString()}` : new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[post.status]} className="shrink-0 capitalize">
                {post.status}
              </Badge>
            </Link>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="calendar" className="mt-3">
        <PostCalendar events={events} />
      </TabsContent>
    </Tabs>
  );
}
