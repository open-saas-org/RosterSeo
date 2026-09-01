import { desc, eq } from "drizzle-orm";
import { blogConnections, blogPlatformTemplates, withUserContext } from "@rosterseo/db";
import { BLOG_PLATFORMS } from "@rosterseo/publishing";
import { PageHeader } from "@/components/page-header";
import { PublishComposer } from "@/components/publish/publish-composer";
import { getCurrentProject } from "@/lib/current-project";

export default async function PublishPage() {
  const { session, project } = await getCurrentProject();

  const [rows, templateRows] = await Promise.all([
    withUserContext(session.user.id, (tx) => tx.select().from(blogConnections).where(eq(blogConnections.projectId, project.id))),
    withUserContext(session.user.id, (tx) =>
      tx.select().from(blogPlatformTemplates).where(eq(blogPlatformTemplates.projectId, project.id)).orderBy(desc(blogPlatformTemplates.createdAt)),
    ),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Publish" description="Write a post once, adapt it per platform with AI, and publish or schedule it to your connected blogs." />
      <PublishComposer
        projectId={project.id}
        platforms={BLOG_PLATFORMS}
        templates={templateRows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))}
        connections={rows.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          platform: r.platform,
          label: r.label,
          authType: r.authType,
          siteIdentifier: r.siteIdentifier,
          status: r.status as "connected" | "needs_reconnect" | "error",
          lastError: r.lastError,
          connectedAt: r.connectedAt.toISOString(),
        }))}
      />
    </div>
  );
}
