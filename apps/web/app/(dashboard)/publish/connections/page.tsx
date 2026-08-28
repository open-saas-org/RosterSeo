import { desc, eq } from "drizzle-orm";
import { blogConnections, withUserContext } from "@seo-tool/db";
import { BLOG_PLATFORMS } from "@seo-tool/publishing";
import { PageHeader } from "@/components/page-header";
import { OAuthStatusBanner } from "@/components/oauth-status-banner";
import { PublishConnectionsWorkspace } from "@/components/publish/publish-connections-workspace";
import { getCurrentProject } from "@/lib/current-project";

const PLATFORM_NAMES = Object.fromEntries(BLOG_PLATFORMS.map((p) => [p.id, p.name]));

export default async function PublishConnectionsPage() {
  const { session, project } = await getCurrentProject();

  const rows = await withUserContext(session.user.id, (tx) => tx.select().from(blogConnections).where(eq(blogConnections.projectId, project.id)).orderBy(desc(blogConnections.connectedAt)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Publish Connections" description="Connect the blogging platforms you want to publish to - each is verified live before it's saved." />
      <OAuthStatusBanner platformNames={PLATFORM_NAMES} />
      <PublishConnectionsWorkspace
        projectId={project.id}
        platforms={BLOG_PLATFORMS}
        initialConnections={rows.map((r) => ({
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
