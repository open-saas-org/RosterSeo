"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, MousePointerClick, Radio } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SocialAnalyticsChart } from "@/components/social/social-analytics-chart";

type AnalyticsResponse = {
  platforms: { platform: string; metricsCapable: boolean }[];
  totals: { reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; clicks: number | null };
  trend: { date: string; reach: number; engagement: number }[];
};

const RANGE_OPTIONS = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
] as const;

// Honest "not available" formatting: a metric total of `null` means no
// row in the window ever had that field set (either no data fetched yet,
// or no metrics-capable platform is connected) - rendered as a dash, not
// a fabricated 0. A real 0 (a platform reported genuinely zero reach)
// renders as "0".
function formatTotal(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function SocialAnalyticsWorkspace({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["value"]>("30");

  const { data, isLoading } = useQuery({
    queryKey: ["social-analytics", projectId, range],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/social/analytics?days=${range}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json() as Promise<AnalyticsResponse>;
    },
  });

  const totals = data?.totals ?? { reach: null, impressions: null, likes: null, comments: null, shares: null, clicks: null };
  const engagement = totals.likes === null && totals.comments === null && totals.shares === null ? null : (totals.likes ?? 0) + (totals.comments ?? 0) + (totals.shares ?? 0);
  const platforms = data?.platforms ?? [];
  const capablePlatforms = platforms.filter((p) => p.metricsCapable);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {capablePlatforms.length === 0
            ? "Connect a Facebook Page, Instagram, or LinkedIn account to start seeing real engagement data here."
            : "Real engagement numbers for Facebook Page, Instagram, and LinkedIn - the platforms with a real insights API. Other connected platforms don't offer this via their public API, see below."}
        </p>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <Button key={opt.value} variant={range === opt.value ? "secondary" : "ghost"} size="sm" onClick={() => setRange(opt.value)}>
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Reach" value={isLoading ? "…" : formatTotal(totals.reach)} icon={Radio} />
        <MetricCard label="Impressions" value={isLoading ? "…" : formatTotal(totals.impressions)} icon={Eye} />
        <MetricCard label="Engagement" value={isLoading ? "…" : formatTotal(engagement)} icon={Heart} />
        <MetricCard label="Clicks" value={isLoading ? "…" : formatTotal(totals.clicks)} icon={MousePointerClick} />
      </div>

      <SocialAnalyticsChart points={data?.trend ?? []} />

      {platforms.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Platform coverage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <Badge key={p.platform} variant={p.metricsCapable ? "secondary" : "outline"}>
                {p.platform.replace("_", " ")} — {p.metricsCapable ? "real analytics" : "not available for this platform"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
