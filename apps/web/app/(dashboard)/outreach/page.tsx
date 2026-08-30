import { desc, eq } from "drizzle-orm";
import { emailConnections, outreachTargets, withUserContext } from "@seo-tool/db";
import { PageHeader } from "@/components/page-header";
import { OutreachWorkspace } from "@/components/outreach/outreach-workspace";
import { getCurrentProject } from "@/lib/current-project";

export default async function OutreachPage() {
  const { session, project } = await getCurrentProject();

  const [targets, connections] = await withUserContext(session.user.id, async (tx) => [
    await tx.select().from(outreachTargets).where(eq(outreachTargets.projectId, project.id)).orderBy(desc(outreachTargets.createdAt)),
    await tx.select().from(emailConnections).where(eq(emailConnections.projectId, project.id)).orderBy(desc(emailConnections.createdAt)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Backlink Outreach"
        description="AI-drafted outreach for real backlink targets - edit before sending, from whichever of your own connected email accounts you pick."
      />
      <OutreachWorkspace
        projectId={project.id}
        initialTargets={targets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), sentAt: t.sentAt?.toISOString() ?? null }))}
        initialConnections={connections.map((c) => ({
          id: c.id,
          type: c.type as "smtp" | "gmail_oauth",
          label: c.label,
          fromEmail: c.fromEmail,
          fromName: c.fromName,
          smtpHost: c.smtpHost,
          smtpPort: c.smtpPort,
          dailySendLimit: c.dailySendLimit,
          gmailNeedsReconnect: c.gmailNeedsReconnect,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
