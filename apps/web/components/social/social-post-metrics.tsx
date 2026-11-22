"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricsRow = {
  id: string;
  socialPostTargetId: string;
  platform: string;
  fetchedAt: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
};

const LABELS: { key: keyof MetricsRow; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "impressions", label: "Impressions" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "clicks", label: "Clicks" },
];

// Additive section in PostsInspector (Phase 1's side panel) - once a post
// is live on a metrics-capable platform (Facebook Page/Instagram/
// LinkedIn), shows its most recent real snapshot. Honestly empty for a
// post with no snapshot yet (not published, or the daily job hasn't run
// since) and for a non-metrics-capable platform - never a fabricated
// number.
export function SocialPostMetrics({ projectId, postId }: { projectId: string; postId: string }) {
  const [rows, setRows] = useState<MetricsRow[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/social/posts/${postId}/metrics`)
      .then((res) => res.json())
      .then((data) => {
        if (active) setRows(data.metrics ?? []);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, [projectId, postId]);

  if (rows === null) return null;

  // Latest snapshot per target - the metrics table is a log, see its
  // schema comment, so take the first (newest-first, per the route's own
  // sort) row for each distinct socialPostTargetId.
  const latestByTarget = new Map<string, MetricsRow>();
  for (const row of rows) {
    if (!latestByTarget.has(row.socialPostTargetId)) latestByTarget.set(row.socialPostTargetId, row);
  }

  if (latestByTarget.size === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Performance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No performance data yet - this fills in automatically once the post is live on a Facebook Page, Instagram, or LinkedIn connection and the
          daily metrics check has run.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Performance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from(latestByTarget.values()).map((row) => (
          <div key={row.socialPostTargetId} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
            <span className="text-xs font-medium capitalize text-muted-foreground">{row.platform.replace("_", " ")}</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {LABELS.map(({ key, label }) => {
                const value = row[key];
                if (typeof value !== "number") return null;
                return (
                  <span key={key} className="text-foreground">
                    <span className="text-muted-foreground">{label}:</span> {value.toLocaleString()}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
