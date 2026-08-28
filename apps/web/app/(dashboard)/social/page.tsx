import { eq } from "drizzle-orm";
import { socialConnections, withUserContext } from "@seo-tool/db";
import { SOCIAL_PLATFORMS } from "@seo-tool/social";
import { PageHeader } from "@/components/page-header";
import { SocialComposer } from "@/components/social/social-composer";
import { getCurrentProject } from "@/lib/current-project";

export default async function SocialPage() {
  const { session, project } = await getCurrentProject();

  const rows = await withUserContext(session.user.id, (tx) => tx.select().from(socialConnections).where(eq(socialConnections.projectId, project.id)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Social" description="Write a post once, adapt it per platform with AI, and post or schedule it to your connected social accounts." />
      <SocialComposer
        projectId={project.id}
        platforms={SOCIAL_PLATFORMS}
        connections={rows.map((r) => ({
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
