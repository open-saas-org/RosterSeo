import { desc, eq } from "drizzle-orm";
import { resolveLocationCode } from "@rosterseo/dataforseo";
import { keywordResearchSearches, trackedKeywords, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { KeywordResearchWorkspace } from "@/components/keywords/keyword-research-workspace";
import { getCurrentProject } from "@/lib/current-project";
import type { KeywordSearchHistoryEntry } from "@/components/keywords/keyword-research-types";

export default async function KeywordResearchPage() {
  const { session, project } = await getCurrentProject();

  const { trackedKeywordList, history } = await withUserContext(session.user.id, async (tx) => {
    const tracked = await tx
      .select({ keyword: trackedKeywords.keyword })
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, project.id));

    const searches = await tx
      .select()
      .from(keywordResearchSearches)
      .where(eq(keywordResearchSearches.projectId, project.id))
      .orderBy(desc(keywordResearchSearches.createdAt))
      .limit(20);

    return { trackedKeywordList: tracked, history: searches };
  });

  const initialTrackedKeywords = [...new Set(trackedKeywordList.map((t) => t.keyword.toLowerCase()))];
  const initialHistory: KeywordSearchHistoryEntry[] = history.map((h) => ({
    id: h.id,
    seedKeyword: h.seedKeyword,
    locationCode: h.locationCode,
    locationName: h.locationName,
    resultCount: h.resultCount,
    createdAt: h.createdAt.toISOString(),
  }));

  const initialLocationCode = await resolveLocationCode(project.targetLocation ?? undefined);
  const initialLocationName = project.targetLocation ?? "United States";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Keyword Research"
        description="Enter a seed keyword to see search volume, difficulty, CPC, competition, and related & question ideas."
      />
      <KeywordResearchWorkspace
        projectId={project.id}
        initialLocationCode={initialLocationCode}
        initialLocationName={initialLocationName}
        initialTrackedKeywords={initialTrackedKeywords}
        initialHistory={initialHistory}
      />
    </div>
  );
}
