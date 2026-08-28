import { eq } from "drizzle-orm";
import { blogConnections, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { PublishComposer } from "@/components/publish/publish-composer";
import { getCurrentProject } from "@/lib/current-project";

export default async function PublishPage() {
  const { session, project } = await getCurrentProject();

  const rows = await withUserContext(session.user.id, (tx) => tx.select().from(blogConnections).where(eq(blogConnections.projectId, project.id)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Publish" description="Write a post once, adapt it per platform with AI, and publish or schedule it to your connected blogs." />
      <PublishComposer
        projectId={project.id}
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
