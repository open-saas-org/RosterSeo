import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { keywordRankings, trackedKeywords, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { addTrackedKeyword } from "@/lib/keywords/add-tracked-keyword";

// GET  /api/projects/:projectId/keywords - list tracked keywords for the
// project, each annotated with its most recent rank-check snapshot (if any).
// POST /api/projects/:projectId/keywords - add keyword(s) to the project's
// tracked list (the rank tracker). Body is either { keyword } (single,
// back-compat) or { keywords: string[] } (bulk, from the Add Keywords
// dialog's textarea). Never calls DataForSEO - this only saves rows;
// position history starts empty until a real Fetch Rankings run
// (POST .../rank-tracking/fetch) writes keyword_rankings rows.
//
// Location is deliberately not accepted here anymore - it's now one
// project-wide setting (rank_tracking_settings), not per-keyword. The
// legacy `location` column stays on the table for old rows but new
// inserts always leave it null.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const keywords = await withUserContext(session.user.id, async (tx) => {
    const tracked = await tx
      .select()
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, projectId))
      .orderBy(desc(trackedKeywords.createdAt));

    if (tracked.length === 0) return [];

    // Latest snapshot per tracked keyword. Fetched as one query (ordered
    // desc) and reduced in JS rather than N+1 queries per row; a
    // DISTINCT ON query would also work but this keeps the RLS-scoped
    // query shape simple and obviously correct.
    const rankings = await tx
      .select()
      .from(keywordRankings)
      .where(
        inArray(
          keywordRankings.trackedKeywordId,
          tracked.map((k) => k.id),
        ),
      )
      .orderBy(desc(keywordRankings.checkedAt));

    const latestByKeywordId = new Map<string, (typeof rankings)[number]>();
    for (const ranking of rankings) {
      if (!latestByKeywordId.has(ranking.trackedKeywordId)) {
        latestByKeywordId.set(ranking.trackedKeywordId, ranking);
      }
    }

    return tracked.map((keyword) => ({
      ...keyword,
      latestRanking: latestByKeywordId.get(keyword.id) ?? null,
    }));
  });

  return NextResponse.json({ keywords });
});

const MAX_TRACKED_KEYWORDS = 1000;

export const POST = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  // Bulk path: { keywords: string[] } - one per line from the Add
  // Keywords dialog's textarea.
  if (Array.isArray(body?.keywords)) {
    const rawKeywords: unknown[] = body.keywords;
    const normalized: string[] = rawKeywords
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);
    const incoming: string[] = [...new Set(normalized)];

    if (incoming.length === 0) {
      return NextResponse.json({ error: "keywords must include at least one non-empty keyword" }, { status: 400 });
    }

    const { added, skipped } = await withUserContext(session.user.id, async (tx) => {
      const existingCount = await tx
        .select({ id: trackedKeywords.id })
        .from(trackedKeywords)
        .where(eq(trackedKeywords.projectId, projectId));

      const existingRows = await tx
        .select({ keyword: trackedKeywords.keyword })
        .from(trackedKeywords)
        .where(and(eq(trackedKeywords.projectId, projectId), inArray(trackedKeywords.keyword, incoming)));
      const existingKeywords = new Set(existingRows.map((r) => r.keyword));

      const room = Math.max(0, MAX_TRACKED_KEYWORDS - existingCount.length);
      const toInsert = incoming.filter((k) => !existingKeywords.has(k)).slice(0, room);

      if (toInsert.length > 0) {
        await tx.insert(trackedKeywords).values(toInsert.map((keyword) => ({ projectId, keyword })));
      }

      return { added: toInsert.length, skipped: incoming.length - toInsert.length };
    });

    return NextResponse.json({ added, skipped }, { status: 201 });
  }

  // Single path (back-compat): { keyword }, still used by Keyword
  // Research's per-row "Track" button.
  const keyword = typeof body?.keyword === "string" ? body.keyword : "";
  if (!keyword.trim()) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const created = await addTrackedKeyword(session.user.id, projectId, keyword);
  return NextResponse.json({ keyword: created }, { status: 201 });
});
