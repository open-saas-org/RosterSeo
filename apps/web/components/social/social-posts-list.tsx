import Link from "next/link";
import { Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import type { SocialPostView } from "./types";

const STATUS_VARIANT: Record<SocialPostView["status"], "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  scheduled: "warning",
  publishing: "warning",
  published: "success",
  partial: "destructive",
  failed: "destructive",
};

export function SocialPostsList({ posts }: { posts: SocialPostView[] }) {
  if (posts.length === 0) {
    return <EmptyState icon={Share2} title="No posts yet" description="Compose your first post to see it here." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {posts.map((post) => (
        <Link key={post.id} href={`/social/posts/${post.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{post.body}</p>
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
  );
}
