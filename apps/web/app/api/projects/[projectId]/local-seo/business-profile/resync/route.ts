import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { localBusinessProfiles, withUserContext } from "@seo-tool/db";
import { getBusinessListingDetails } from "@seo-tool/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/local-seo/business-profile/resync
// Re-runs the same real DataForSEO lookup (searchQuery + locationCode)
// used when the profile was first saved, and refreshes the enrichment
// columns. 400s if the profile has no searchQuery/locationCode (a
// manual-only entry has nothing to replay a lookup against).

type RouteParams = { projectId: string };

export const POST = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const profile = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return row ?? null;
  });

  if (!profile) {
    return NextResponse.json({ error: "No business profile saved yet" }, { status: 404 });
  }
  if (!profile.searchQuery || !profile.locationCode) {
    return NextResponse.json(
      { error: "This location was entered manually - there's no real listing to re-sync from." },
      { status: 400 },
    );
  }

  let enrichment: Awaited<ReturnType<typeof getBusinessListingDetails>>;
  try {
    enrichment = await getBusinessListingDetails(profile.searchQuery, profile.locationCode);
  } catch (err) {
    console.error("Business profile resync failed", err);
    return NextResponse.json({ error: "Re-sync failed. Try again shortly." }, { status: 502 });
  }

  if (!enrichment) {
    return NextResponse.json({ error: "Couldn't find this listing anymore - it may have been removed or renamed." }, { status: 404 });
  }

  const [row] = await withUserContext(session.user.id, (tx) =>
    tx
      .update(localBusinessProfiles)
      .set({
        address: enrichment!.address,
        category: enrichment!.category,
        rating: enrichment!.rating,
        reviewCount: enrichment!.reviewCount,
        placeId: enrichment!.placeId,
        cid: enrichment!.cid,
        phone: enrichment!.phone,
        website: enrichment!.website,
        domain: enrichment!.domain,
        additionalCategories: enrichment!.additionalCategories,
        description: enrichment!.description,
        totalPhotos: enrichment!.totalPhotos,
        isClaimed: enrichment!.isClaimed,
        workTime: enrichment!.workTime,
        attributes: enrichment!.attributes,
        lastSyncedAt: new Date(),
      })
      .where(eq(localBusinessProfiles.projectId, projectId))
      .returning(),
  );

  return NextResponse.json({ profile: row });
});
