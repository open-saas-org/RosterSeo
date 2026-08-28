import { and, eq } from "drizzle-orm";
import { projectCompetitors, withUserContext } from "@seo-tool/db";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";

// Real shared logic behind POST /api/projects/:projectId/competitors -
// extracted so Clay's add_competitor tool (apps/web/lib/clay/tools/write.ts)
// calls the exact same real insert the Competitors page already does.
export async function addCompetitor(userId: string, projectId: string, rawDomain: string, rawName?: string) {
  const domain = normalizeDomain(rawDomain);
  const name = rawName?.trim() || null;

  if (!isValidDomain(domain)) {
    throw new Error("Enter a valid domain, e.g. example.com");
  }

  return withUserContext(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projectCompetitors)
      .where(and(eq(projectCompetitors.projectId, projectId), eq(projectCompetitors.domain, domain)))
      .limit(1);
    if (existing) throw new Error("This domain is already tracked for this project.");

    const [competitor] = await tx.insert(projectCompetitors).values({ projectId, domain, name }).returning();
    return competitor;
  });
}
