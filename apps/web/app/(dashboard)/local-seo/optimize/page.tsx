import { desc, eq } from "drizzle-orm";
import { localBusinessProfiles, localSeoRecommendations, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { OptimizeWorkspace } from "@/components/local-seo/optimize-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function OptimizePage() {
  const { session, project } = await getCurrentProject();

  const [profile, recommendations] = await Promise.all([
    withUserContext(session.user.id, async (tx) => {
      const [row] = await tx.select().from(localBusinessProfiles).where(eq(localBusinessProfiles.projectId, project.id)).limit(1);
      return row ?? null;
    }),
    withUserContext(session.user.id, (tx) =>
      tx.select().from(localSeoRecommendations).where(eq(localSeoRecommendations.projectId, project.id)).orderBy(desc(localSeoRecommendations.createdAt)),
    ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Optimize" description={`A local SEO strategy for ${project.name} - generated once, tracked as a checklist.`} />
      <OptimizeWorkspace
        projectId={project.id}
        hasProfile={profile !== null}
        initialRecommendations={recommendations.map((r) => ({
          id: r.id,
          category: r.category as "listing" | "content" | "reviews" | "technical",
          title: r.title,
          description: r.description,
          status: r.status as "todo" | "done",
        }))}
      />
    </div>
  );
}
