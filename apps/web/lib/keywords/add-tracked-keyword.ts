import { and, eq, isNull } from "drizzle-orm";
import { trackedKeywords, withUserContext } from "@rosterseo/db";

// Real shared logic behind POST /api/projects/:projectId/keywords' single-
// keyword path - extracted so Cappy's add_tracked_keyword tool
// (apps/web/lib/cappy/tools/write.ts) calls the exact same real insert the
// Keyword Research page's "Track" button already does, not a second copy.
export async function addTrackedKeyword(userId: string, projectId: string, rawKeyword: string) {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) throw new Error("keyword is required");

  return withUserContext(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(trackedKeywords)
      .where(and(eq(trackedKeywords.projectId, projectId), eq(trackedKeywords.keyword, keyword), isNull(trackedKeywords.location)))
      .limit(1);
    if (existing) return existing;

    const [row] = await tx.insert(trackedKeywords).values({ projectId, keyword }).returning();
    return row;
  });
}
