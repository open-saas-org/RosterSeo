import { desc, eq } from "drizzle-orm";
import { projectCompetitors, withUserContext } from "@rosterseo/db";
import { resolveLocationCode } from "@rosterseo/dataforseo";
import { PageHeader } from "@/components/page-header";
import { CompetitorWorkspace } from "@/components/competitors/competitor-workspace";
import { getCurrentProject } from "@/lib/current-project";
import { getCachedSnapshots } from "@/app/(dashboard)/competitors/actions";

export default async function CompetitorsPage() {
  const { session, project } = await getCurrentProject();

  const tracked = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        id: projectCompetitors.id,
        domain: projectCompetitors.domain,
        name: projectCompetitors.name,
        aliases: projectCompetitors.aliases,
        additionalDomains: projectCompetitors.additionalDomains,
      })
      .from(projectCompetitors)
      .where(eq(projectCompetitors.projectId, project.id))
      .orderBy(desc(projectCompetitors.createdAt)),
  );

  // Already-scanned data for whichever of these have been Scanned before -
  // read straight from the cache (no DataForSEO call), so a competitor's
  // real numbers survive a page refresh instead of reverting to "not
  // scanned yet" every time.
  const locationCode = await resolveLocationCode(project.targetLocation ?? undefined);
  const snapshots = await getCachedSnapshots(session.user.id, project.id, locationCode);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Competitor research"
        description="Track competitor domains to compare traffic, top pages, backlink profile, and keyword gaps - this same list is what AI Visibility compares your brand against."
      />
      <CompetitorWorkspace
        projectId={project.id}
        initialCompetitors={tracked}
        targetLocation={project.targetLocation ?? undefined}
        initialSnapshots={Object.fromEntries(snapshots)}
      />
    </div>
  );
}
