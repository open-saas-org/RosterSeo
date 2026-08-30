import { eq } from "drizzle-orm";
import { localBusinessProfiles, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { BusinessProfileWorkspace } from "@/components/local-seo/business-profile-workspace";
import { GbpPerformanceSection } from "@/components/local-seo/gbp-performance-section";
import type { LocalBusinessProfile } from "@/components/local-seo/business-profile-listing";
import { getCurrentProject } from "@/lib/current-project";

export default async function LocalSeoProfilePage() {
  const { session, project } = await getCurrentProject();

  const row = await withUserContext(session.user.id, async (tx) => {
    const [r] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, project.id)).limit(1);
    return r ?? null;
  });

  const profile: LocalBusinessProfile | null = row
    ? {
        projectId: row.projectId,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        placeId: row.placeId,
        cid: row.cid,
        searchQuery: row.searchQuery,
        locationCode: row.locationCode,
        address: row.address,
        phone: row.phone,
        website: row.website,
        domain: row.domain,
        category: row.category,
        additionalCategories: row.additionalCategories,
        description: row.description,
        rating: row.rating,
        reviewCount: row.reviewCount,
        totalPhotos: row.totalPhotos,
        isClaimed: row.isClaimed,
        workTime: row.workTime,
        attributes: row.attributes,
        lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
        trackedKeyword: row.trackedKeyword,
        gridSize: row.gridSize,
        radiusKm: row.radiusKm,
        autoTrackEnabled: row.autoTrackEnabled,
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Profile"
        description={`Your business's real Google listing data for ${project.name} - no Google account needed.`}
      />
      <BusinessProfileWorkspace projectId={project.id} initialProfile={profile} />
      {profile ? <GbpPerformanceSection projectId={project.id} /> : null}
    </div>
  );
}
