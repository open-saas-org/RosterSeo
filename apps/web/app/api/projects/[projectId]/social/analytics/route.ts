import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { socialConnections, socialPostMetrics, socialPostTargets, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";

type RouteParams = { projectId: string };

const METRICS_CAPABLE_PLATFORMS = ["facebook_page", "instagram", "linkedin"];

// GET ?days=30|90 - real per-platform analytics for the /social/analytics
// page (PUBLISHING_PLATFORM_PRD.md §3). Returns:
// - `platforms`: every connected platform, flagged with whether it's
//   metrics-capable at all (Bluesky/Mastodon/Pinterest/Threads/X have no
//   fetchMetrics() - see packages/social/src/types.ts - so the UI shows
//   an honest "not available for this platform" state for those, never a
//   fabricated zero).
// - `totals`: summed reach/impressions/likes/comments/shares/clicks
//   across every metrics row in the window, per metric - each stays
//   `null` if literally no row in the window has that field set, so the
//   UI can distinguish "zero engagement" from "no data at all."
// - `trend`: one point per day in the window with that day's totals, for
//   the reach/engagement-over-time chart.
export const GET = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam === "90" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(socialConnections).where(eq(socialConnections.projectId, projectId)),
  );

  const metricsCapableConnectionIds = connections.filter((c) => METRICS_CAPABLE_PLATFORMS.includes(c.platform)).map((c) => c.id);

  const rows =
    metricsCapableConnectionIds.length === 0
      ? []
      : await withUserContext(session.user.id, (tx) =>
          tx
            .select({
              fetchedAt: socialPostMetrics.fetchedAt,
              platform: socialPostMetrics.platform,
              reach: socialPostMetrics.reach,
              impressions: socialPostMetrics.impressions,
              likes: socialPostMetrics.likes,
              comments: socialPostMetrics.comments,
              shares: socialPostMetrics.shares,
              clicks: socialPostMetrics.clicks,
            })
            .from(socialPostMetrics)
            .innerJoin(socialPostTargets, eq(socialPostTargets.id, socialPostMetrics.socialPostTargetId))
            .where(and(eq(socialPostMetrics.projectId, projectId), gte(socialPostMetrics.fetchedAt, since), inArray(socialPostTargets.socialConnectionId, metricsCapableConnectionIds)))
            .orderBy(desc(socialPostMetrics.fetchedAt)),
        );

  const platforms = Array.from(new Set(connections.map((c) => c.platform))).map((platform) => ({
    platform,
    metricsCapable: METRICS_CAPABLE_PLATFORMS.includes(platform),
  }));

  const metricKeys = ["reach", "impressions", "likes", "comments", "shares", "clicks"] as const;
  const totals: Record<(typeof metricKeys)[number], number | null> = {
    reach: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    clicks: null,
  };
  for (const row of rows) {
    for (const key of metricKeys) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const byDay = new Map<string, { date: string; reach: number; engagement: number }>();
  for (const row of rows) {
    const date = row.fetchedAt.toISOString().slice(0, 10);
    const entry = byDay.get(date) ?? { date, reach: 0, engagement: 0 };
    entry.reach += row.reach ?? 0;
    entry.engagement += (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0);
    byDay.set(date, entry);
  }
  const trend = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ platforms, totals, trend });
});
