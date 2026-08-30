import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { projectCompetitors, withUserContext } from "@rosterseo/db";
import { resolveLocationCode } from "@rosterseo/dataforseo";
import { getCurrentProject } from "@/lib/current-project";
import { getAiVisibilityByDomain } from "@/lib/competitors/ai-visibility-mentions";
import { getCachedSnapshots } from "@/app/(dashboard)/competitors/actions";
import { CompetitorDetailPage } from "@/components/competitors/competitor-detail-page";

export default async function CompetitorDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, project } = await getCurrentProject();

  const [competitor] = await withUserContext(session.user.id, (tx) =>
    tx
      .select()
      .from(projectCompetitors)
      .where(and(eq(projectCompetitors.id, id), eq(projectCompetitors.projectId, project.id)))
      .limit(1),
  );
  if (!competitor) notFound();

  const locationCode = await resolveLocationCode(project.targetLocation ?? undefined);
  const [aiVisibilityByDomain, snapshots] = await Promise.all([
    getAiVisibilityByDomain(session.user.id, project.id),
    getCachedSnapshots(session.user.id, project.id, locationCode),
  ]);

  return (
    <CompetitorDetailPage
      projectId={project.id}
      targetLocation={project.targetLocation ?? undefined}
      competitor={{
        id: competitor.id,
        domain: competitor.domain,
        name: competitor.name,
        aliases: competitor.aliases,
        additionalDomains: competitor.additionalDomains,
      }}
      initialSnapshot={snapshots.get(competitor.domain)}
      aiVisibilityPercent={aiVisibilityByDomain[competitor.domain]}
    />
  );
}
