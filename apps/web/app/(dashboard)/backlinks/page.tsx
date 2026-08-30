import { desc, eq } from "drizzle-orm";
import { backlinksCache, withUserContext } from "@rosterseo/db";
import { PageHeader } from "@/components/page-header";
import { BacklinksWorkspace } from "@/components/backlinks/backlinks-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function BacklinksPage() {
  const { session, project } = await getCurrentProject();

  const history = await withUserContext(session.user.id, (tx) =>
    tx
      .select({ domain: backlinksCache.domain, fetchedAt: backlinksCache.fetchedAt })
      .from(backlinksCache)
      .where(eq(backlinksCache.projectId, project.id))
      .orderBy(desc(backlinksCache.fetchedAt))
      .limit(10),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Backlinks"
        description="Look up any domain to see its total backlinks, referring domains, and domain rating from the built-in backlink index."
      />
      <BacklinksWorkspace
        projectId={project.id}
        initialHistory={history.map((h) => ({ domain: h.domain, fetchedAt: h.fetchedAt.toISOString() }))}
      />
    </div>
  );
}
