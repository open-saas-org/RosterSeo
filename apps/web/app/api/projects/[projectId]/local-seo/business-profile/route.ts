import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { localBusinessProfiles, withUserContext } from "@seo-tool/db";
import { getBusinessListingDetails } from "@seo-tool/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// GET   /api/projects/:projectId/local-seo/business-profile - the saved profile, or null
// PATCH /api/projects/:projectId/local-seo/business-profile
// Body: { name, lat, lng, address?, category?, rating?, reviewCount?,
//         placeId?, searchQuery?, locationCode? } - whatever a picked
// searchMapsBusinesses result carries, plus the query/locationCode used to
// find it (needed for enrichment now and resync later). A manual lat/lng
// entry omits searchQuery/locationCode and just saves the base fields.
//
// When searchQuery+locationCode are present, this makes ONE further real
// call (getBusinessListingDetails) to pull the full real listing
// (category, hours, phone, attributes, rating, etc) and merges it in. If
// that enrichment call fails or finds nothing, the base fields still save -
// enrichment is a nice-to-have on top of a successful pick, not a
// precondition for saving one (handle errors gracefully, don't block the
// save over it).

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const profile = await withUserContext(session.user.id, async (tx) => {
    const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, projectId)).limit(1);
    return row ?? null;
  });

  return NextResponse.json({ profile });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const lat = typeof body?.lat === "number" ? body.lat : null;
  const lng = typeof body?.lng === "number" ? body.lng : null;
  const address = typeof body?.address === "string" ? body.address : null;
  const category = typeof body?.category === "string" ? body.category : null;
  const rating = typeof body?.rating === "number" ? body.rating : null;
  const reviewCount = typeof body?.reviewCount === "number" ? body.reviewCount : null;
  const placeId = typeof body?.placeId === "string" ? body.placeId : null;
  const searchQuery = typeof body?.searchQuery === "string" ? body.searchQuery.trim() : null;
  const locationCode = typeof body?.locationCode === "number" ? body.locationCode : null;

  if (!name || lat === null || lng === null) {
    return NextResponse.json({ error: "name, lat, and lng are required" }, { status: 400 });
  }

  let enrichment: Awaited<ReturnType<typeof getBusinessListingDetails>> = null;
  if (searchQuery && locationCode) {
    try {
      enrichment = await getBusinessListingDetails(searchQuery, locationCode);
    } catch (err) {
      console.error("Business listing enrichment failed, saving base fields only", err);
    }
  }

  const values = {
    projectId,
    name,
    lat,
    lng,
    address: enrichment?.address ?? address,
    category: enrichment?.category ?? category,
    rating: enrichment?.rating ?? rating,
    reviewCount: enrichment?.reviewCount ?? reviewCount,
    placeId: enrichment?.placeId ?? placeId,
    searchQuery,
    locationCode,
    cid: enrichment?.cid ?? null,
    phone: enrichment?.phone ?? null,
    website: enrichment?.website ?? null,
    domain: enrichment?.domain ?? null,
    additionalCategories: enrichment?.additionalCategories ?? null,
    description: enrichment?.description ?? null,
    totalPhotos: enrichment?.totalPhotos ?? null,
    isClaimed: enrichment?.isClaimed ?? null,
    workTime: enrichment?.workTime ?? null,
    attributes: enrichment?.attributes ?? null,
    lastSyncedAt: enrichment ? new Date() : null,
  };

  const [row] = await withUserContext(session.user.id, (tx) =>
    tx
      .insert(localBusinessProfiles)
      .values(values)
      .onConflictDoUpdate({ target: localBusinessProfiles.projectId, set: values })
      .returning(),
  );

  return NextResponse.json({ profile: row });
});
