import { and, eq } from "drizzle-orm";
import { outreachTargets, withUserContext } from "@rosterseo/db";
import { generateOutreachEmail } from "@rosterseo/ai-visibility";

// Real shared logic behind POST .../outreach/[outreachId]/draft -
// extracted so Cappy's generate_outreach_draft tool
// (apps/web/lib/cappy/tools/write.ts) runs the exact same real OpenRouter
// call + overwrite the Outreach page's "Generate with AI" button does.
export async function generateDraftForOutreachTarget(
  userId: string,
  projectId: string,
  outreachId: string,
  project: { domain: string; name: string },
) {
  const [target] = await withUserContext(userId, (tx) =>
    tx.select().from(outreachTargets).where(and(eq(outreachTargets.id, outreachId), eq(outreachTargets.projectId, projectId))).limit(1),
  );
  if (!target) throw new Error("Outreach target not found.");

  const outcome = await generateOutreachEmail({
    yourDomain: project.domain,
    yourProjectName: project.name,
    targetDomain: target.domain,
    targetPageUrl: target.sourceUrlFrom ?? undefined,
  });

  if (outcome.status === "not_configured") throw new Error("Configure OpenRouter (OPENROUTER_API_KEY) to generate AI drafts.");
  if (outcome.status === "failed") throw new Error(`Draft generation failed: ${outcome.error}`);

  const [updated] = await withUserContext(userId, (tx) =>
    tx
      .update(outreachTargets)
      .set({ subject: outcome.result.subject, body: outcome.result.body, status: "drafted" })
      .where(eq(outreachTargets.id, outreachId))
      .returning(),
  );

  return updated;
}
