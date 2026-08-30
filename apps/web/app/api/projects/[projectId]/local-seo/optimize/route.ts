import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { localBusinessProfiles, localGridScanPoints, localGridScans, localSeoRecommendations, withUserContext } from "@rosterseo/db";
import { getLocalPackResultsAtCoordinate } from "@rosterseo/dataforseo";
import { generateLocalSeoStrategy } from "@rosterseo/ai-visibility";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET  /api/projects/:projectId/local-seo/optimize - the saved checklist
// POST /api/projects/:projectId/local-seo/optimize - generate (manual
// trigger only, never automatic): gathers the real business profile +
// latest grid scan summary + real nearby competitors, asks the LLM for a
// strategy, and persists new recommendations (deduped by title against
// what's already saved) so regenerating doesn't spam duplicates and the
// checklist survives across visits.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const recommendations = await withUserContext(session.user.id, (tx) =>
    tx.select().from(localSeoRecommendations).where(eq(localSeoRecommendations.projectId, projectId)).orderBy(desc(localSeoRecommendations.createdAt)),
  );

  return NextResponse.json({ recommendations });
});

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { profile, latestScan, existingTitles } = await withUserContext(session.user.id, async (tx) => {
    const [profileRow] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    const [scanRow] = await tx
      .select()
      .from(localGridScans)
      .where(eq(localGridScans.projectId, projectId))
      .orderBy(desc(localGridScans.createdAt))
      .limit(1);
    const points = scanRow ? await tx.select().from(localGridScanPoints).where(eq(localGridScanPoints.scanId, scanRow.id)) : [];
    const existing = await tx.select({ title: localSeoRecommendations.title }).from(localSeoRecommendations).where(eq(localSeoRecommendations.projectId, projectId));
    return { profile: profileRow ?? null, latestScan: scanRow ? { scan: scanRow, points } : null, existingTitles: new Set(existing.map((e) => e.title)) };
  });

  if (!profile) {
    return NextResponse.json({ error: "Save a business profile first, on the Profile page." }, { status: 400 });
  }

  const gridSummary = latestScan
    ? (() => {
        const found = latestScan.points.filter((p) => p.position !== null).map((p) => p.position!);
        const avgPosition = found.length > 0 ? found.reduce((a, b) => a + b, 0) / found.length : null;
        const pctInTop3 = latestScan.points.length > 0 ? (found.filter((p) => p <= 3).length / latestScan.points.length) * 100 : 0;
        return { avgPosition, pctInTop3, gridSize: latestScan.scan.gridSize };
      })()
    : null;

  // Real nearby competitors, if there's a tracked keyword to search with -
  // one more live local-pack check at the business's own coordinates,
  // excluding the business itself. No fabricated competitor names.
  let topCompetitors: string[] = [];
  if (profile.trackedKeyword) {
    try {
      const results = await getLocalPackResultsAtCoordinate(profile.trackedKeyword, profile.lat, profile.lng);
      const nameNeedle = profile.name.trim().toLowerCase();
      topCompetitors = results
        .filter((r) => !r.businessName.toLowerCase().includes(nameNeedle))
        .slice(0, 3)
        .map((r) => r.businessName);
    } catch (err) {
      console.error("Couldn't fetch competitors for Optimize strategy, continuing without them", err);
    }
  }

  const recommendations = await generateLocalSeoStrategy({
    profile: {
      name: profile.name,
      category: profile.category,
      additionalCategories: profile.additionalCategories ?? [],
      description: profile.description,
      phone: profile.phone,
      website: profile.website,
      hasHours: profile.workTime !== null,
      totalPhotos: profile.totalPhotos ?? 0,
      rating: profile.rating,
      reviewCount: profile.reviewCount ?? 0,
    },
    gridSummary,
    topCompetitors,
  });

  if (!recommendations) {
    return NextResponse.json({ error: "No LLM provider configured, or a strategy couldn't be generated." }, { status: 422 });
  }

  const newOnes = recommendations.filter((r) => !existingTitles.has(r.title));
  const inserted = newOnes.length > 0
    ? await withUserContext(session.user.id, (tx) =>
        tx.insert(localSeoRecommendations).values(newOnes.map((r) => ({ projectId, ...r }))).returning(),
      )
    : [];

  return NextResponse.json({ recommendations: inserted, skippedDuplicates: recommendations.length - newOnes.length });
});
