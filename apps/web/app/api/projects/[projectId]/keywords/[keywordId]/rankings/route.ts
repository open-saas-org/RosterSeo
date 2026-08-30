import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { keywordRankings, rankTrackingSettings, trackedKeywords, withUserContext } from "@rosterseo/db";
import { checkKeywordRanking, DataForSeoNotConfiguredError, resolveLocationCode } from "@rosterseo/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { normalizeDomain } from "@/components/competitors/domain-utils";

// GET  /api/projects/:projectId/keywords/:keywordId/rankings - full position
// history for one tracked keyword (oldest -> newest), i.e. the data behind
// the rank-tracker trend chart.
// POST /api/projects/:projectId/keywords/:keywordId/rankings - a one-off
// "check this keyword now" (not part of a bulk Fetch Rankings run - runId
// stays null, so this doesn't skew the position-distribution chart). Always
// runs a real DataForSEO SERP lookup using the project's
// rank_tracking_settings (location/device), same as a bulk run - no
// manual/explicit-position override accepted (removed: it was an ungated
// escape hatch nothing in the UI ever used, and it let any authenticated
// caller write a fabricated position straight into real rank history).

type RouteParams = { projectId: string; keywordId: string };

async function loadTrackedKeyword(projectId: string, keywordId: string, userId: string) {
  return withUserContext(userId, async (tx) => {
    const [keyword] = await tx
      .select()
      .from(trackedKeywords)
      .where(eq(trackedKeywords.id, keywordId))
      .limit(1);
    if (!keyword || keyword.projectId !== projectId) return null;
    return keyword;
  });
}

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId, keywordId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const trackedKeyword = await loadTrackedKeyword(projectId, keywordId, session.user.id);
  if (!trackedKeyword) {
    return NextResponse.json({ error: "Tracked keyword not found" }, { status: 404 });
  }

  const rankings = await withUserContext(session.user.id, async (tx) => {
    return tx
      .select()
      .from(keywordRankings)
      .where(eq(keywordRankings.trackedKeywordId, keywordId))
      .orderBy(asc(keywordRankings.checkedAt));
  });

  return NextResponse.json({ keyword: trackedKeyword, rankings });
});

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId, keywordId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const trackedKeyword = await loadTrackedKeyword(projectId, keywordId, session.user.id);
  if (!trackedKeyword) {
    return NextResponse.json({ error: "Tracked keyword not found" }, { status: 404 });
  }

  const settings = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(rankTrackingSettings).where(eq(rankTrackingSettings.projectId, projectId)).limit(1);
    return row ?? null;
  });

  const locationCode = settings?.locationCode ?? (await resolveLocationCode(project.targetLocation ?? undefined));
  const device = settings?.device === "mobile" ? "mobile" : "desktop";

  try {
    const { organicResults, serpFeatures, isMock } = await checkKeywordRanking(trackedKeyword.keyword, locationCode, device);
    const projectDomain = normalizeDomain(project.domain);
    const match = organicResults.find((r) => normalizeDomain(r.domain) === projectDomain);
    const position = match?.position ?? null;
    const url = match?.url ?? null;

    const [snapshot] = await withUserContext(session.user.id, async (tx) => {
      return tx
        .insert(keywordRankings)
        .values({ trackedKeywordId: keywordId, position, url, device, serpFeatures, isMock })
        .returning();
    });

    return NextResponse.json({ ranking: snapshot }, { status: 201 });
  } catch (err) {
    const message = err instanceof DataForSeoNotConfiguredError ? err.message : "Couldn't check this keyword's real ranking right now.";
    console.error("[keywords/rankings] real rank check failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
