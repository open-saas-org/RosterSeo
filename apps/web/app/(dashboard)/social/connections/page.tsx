import { desc, eq } from "drizzle-orm";
import { socialConnections, withUserContext } from "@seo-tool/db";
import { SOCIAL_PLATFORMS } from "@seo-tool/social";
import { PageHeader } from "@/components/page-header";
import { OAuthStatusBanner } from "@/components/oauth-status-banner";
import { SocialConnectionsWorkspace } from "@/components/social/social-connections-workspace";
import { getCurrentProject } from "@/lib/current-project";

const PLATFORM_NAMES = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.name]));

export default async function SocialConnectionsPage() {
  const { session, project } = await getCurrentProject();

  const rows = await withUserContext(session.user.id, (tx) => tx.select().from(socialConnections).where(eq(socialConnections.projectId, project.id)).orderBy(desc(socialConnections.connectedAt)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Social Connections" description="Connect the social platforms you want to post to - each is verified live before it's saved." />
      <OAuthStatusBanner platformNames={PLATFORM_NAMES} />
      <SocialConnectionsWorkspace
        projectId={project.id}
        platforms={SOCIAL_PLATFORMS}
        initialConnections={rows.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          platform: r.platform,
          label: r.label,
          authType: r.authType,
          accountIdentifier: r.accountIdentifier,
          status: r.status as "connected" | "needs_reconnect" | "error",
          lastError: r.lastError,
          connectedAt: r.connectedAt.toISOString(),
        }))}
      />
    </div>
  );
}
