import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, projects, withUserContext } from "@seo-tool/db";
import { fetchGscExactWindow, getGA4TopLandingPages } from "@seo-tool/google";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { getValidAccessToken } from "@/lib/google-token";

type RouteParams = { projectId: string };

const GSC_LOOKBACK_DAYS = 28;
// GA4 has no reporting-lag quirk like GSC (see gsc-window.ts) - a plain
// trailing window is fine.
const GA4_LOOKBACK_DAYS = 28;
// Comfortably above any real site's page count this table would show
// (Site Audit itself caps a crawl at 5000 pages) - one real GA4 call
// covering every landing page rather than paging.
const GA4_PAGE_LIMIT = 5000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Normalizes a GSC "page" (a full URL) or a GA4 "landingPage" (already
// just a path, but may carry a query string) down to the same bare-path
// shape site_audit_pages.url's own path portion uses, so the two real,
// independently-shaped Google APIs and our own crawl data can actually be
// joined by key.
function toPath(value: string): string {
  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    // Already a path (GA4) - use as-is.
  }
  path = path.split("?")[0]!;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

// GET - real per-page Search Console (impressions/clicks/ctr/position) and
// GA4 (sessions/engagement rate) metrics for this project, keyed by URL
// path so the Pages table can join them onto its own crawled rows. Returns
// null for whichever side isn't connected - never fabricated/estimated
// data standing in for a real connection.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [projectRow] = await withUserContext(session.user.id, (tx) =>
    tx.select({ gscPropertyId: projects.gscPropertyId, ga4PropertyId: projects.ga4PropertyId, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId)).limit(1),
  );
  if (!projectRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connections = await withUserContext(session.user.id, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, projectRow.organizationId)),
  );
  const gscConnection = connections.find((c) => c.service === "gsc");
  const ga4Connection = connections.find((c) => c.service === "ga4");

  const gscByPath: Record<string, { impressions: number; clicks: number; ctr: number; position: number }> = {};
  if (projectRow.gscPropertyId && gscConnection) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, gscConnection);
      const { queryPageRows } = await fetchGscExactWindow(accessToken, projectRow.gscPropertyId, GSC_LOOKBACK_DAYS);
      const byPath = new Map<string, { impressions: number; clicks: number; positionWeighted: number }>();
      for (const row of queryPageRows) {
        if (!row.page) continue;
        const path = toPath(row.page);
        const entry = byPath.get(path) ?? { impressions: 0, clicks: 0, positionWeighted: 0 };
        entry.impressions += row.impressions;
        entry.clicks += row.clicks;
        entry.positionWeighted += row.position * row.impressions;
        byPath.set(path, entry);
      }
      for (const [path, entry] of byPath) {
        gscByPath[path] = {
          impressions: entry.impressions,
          clicks: entry.clicks,
          ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : 0,
          position: entry.impressions > 0 ? entry.positionWeighted / entry.impressions : 0,
        };
      }
    } catch {
      // Real token/API failure - leave gscByPath empty rather than fail
      // the whole page-metrics response over one side.
    }
  }

  const ga4ByPath: Record<string, { sessions: number; engagementRate: number }> = {};
  if (projectRow.ga4PropertyId && ga4Connection) {
    try {
      const accessToken = await getValidAccessToken(session.user.id, ga4Connection);
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (GA4_LOOKBACK_DAYS - 1));
      const rows = await getGA4TopLandingPages(accessToken, projectRow.ga4PropertyId, isoDate(start), isoDate(end), GA4_PAGE_LIMIT);
      for (const row of rows) {
        if (!row.landingPage) continue;
        const path = toPath(row.landingPage);
        const existing = ga4ByPath[path];
        // A path can appear more than once (query-string variants collapse
        // to the same normalized path) - sum sessions, keep the
        // impression-weight-free average of engagementRate simple (last
        // write wins is wrong here, so accumulate a session-weighted mean).
        if (existing) {
          const totalSessions = existing.sessions + row.sessions;
          existing.engagementRate = totalSessions > 0 ? (existing.engagementRate * existing.sessions + row.engagementRate * row.sessions) / totalSessions : existing.engagementRate;
          existing.sessions = totalSessions;
        } else {
          ga4ByPath[path] = { sessions: row.sessions, engagementRate: row.engagementRate };
        }
      }
    } catch {
      // Same real-failure handling as GSC above.
    }
  }

  return NextResponse.json({
    gscConnected: !!(projectRow.gscPropertyId && gscConnection),
    ga4Connected: !!(projectRow.ga4PropertyId && ga4Connection),
    gscByPath,
    ga4ByPath,
  });
});
