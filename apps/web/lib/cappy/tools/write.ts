import { eq } from "drizzle-orm";
import { blogConnections, socialConnections, cappyProjectNotes, withUserContext } from "@rosterseo/db";
import { addTrackedKeyword } from "@/lib/keywords/add-tracked-keyword";
import { addCompetitor } from "@/lib/competitors/add-competitor";
import { trackAiVisibilityPrompt } from "@/lib/ai-visibility/track-prompt";
import { startSiteAudit } from "@/lib/site-audit/start-site-audit";
import { addOutreachTarget } from "@/lib/outreach/add-outreach-target";
import { generateDraftForOutreachTarget } from "@/lib/outreach/generate-outreach-draft";
import { createBlogPost } from "@/lib/publish/create-post";
import { createSocialPost } from "@/lib/social/create-post";
import type { CappyToolContext } from "./registry";

// Every write tool here calls a function extracted from the existing route
// that already does this same real work (see each import) - Cappy never
// re-implements a write, it reuses the exact same code path the app's own
// UI already exercises. All 6 of these require explicit user confirmation
// before executing (see registry.ts's CAPPY_TOOLS) - update_project_notes
// below is the one deliberate exception (see its own comment).

export async function writeAddTrackedKeyword(ctx: CappyToolContext, args: { keyword: string }) {
  return addTrackedKeyword(ctx.userId, ctx.projectId, args.keyword);
}

export async function writeAddCompetitor(ctx: CappyToolContext, args: { domain: string; name?: string }) {
  return addCompetitor(ctx.userId, ctx.projectId, args.domain, args.name);
}

export async function writeTrackAiVisibilityPrompt(ctx: CappyToolContext, args: { promptText: string }) {
  return trackAiVisibilityPrompt(ctx.userId, ctx.projectId, args.promptText);
}

export async function writeStartSiteAudit(
  ctx: CappyToolContext,
  args: { domain?: string; customSitemapUrl?: string; maxPages?: number },
  project: { id: string; domain: string },
) {
  const auditId = await startSiteAudit(ctx.userId, project, args);
  return { auditId };
}

export async function writeAddOutreachTarget(ctx: CappyToolContext, args: { domain: string; sourceUrlFrom?: string; contactEmail?: string }) {
  return addOutreachTarget(ctx.userId, ctx.projectId, args);
}

export async function writeGenerateOutreachDraft(ctx: CappyToolContext, args: { outreachId: string }, project: { domain: string; name: string }) {
  return generateDraftForOutreachTarget(ctx.userId, ctx.projectId, args.outreachId, project);
}

// The model names platforms it saw from get_blog_connections (e.g.
// "wordpress", "devto"), not raw connection UUIDs it's never seen -
// resolved to real connectionIds here.
export async function writeCreateBlogPost(ctx: CappyToolContext, args: { title: string; body: string; tags?: string[]; platforms: string[] }) {
  const connections = await withUserContext(ctx.userId, (tx) =>
    tx.select({ id: blogConnections.id, platform: blogConnections.platform }).from(blogConnections).where(eq(blogConnections.projectId, ctx.projectId)),
  );
  const connectionIds = args.platforms.map((platform) => {
    const match = connections.find((c) => c.platform === platform);
    if (!match) {
      const connected = connections.map((c) => c.platform).join(", ") || "none";
      throw new Error(`"${platform}" isn't a connected blog platform for this project. Connected: ${connected}.`);
    }
    return match.id;
  });

  return createBlogPost(ctx.userId, ctx.projectId, { title: args.title, body: args.body, tags: args.tags ?? [], connectionIds });
}

export async function writeCreateSocialPost(ctx: CappyToolContext, args: { text: string; platforms: string[] }) {
  const connections = await withUserContext(ctx.userId, (tx) =>
    tx.select({ id: socialConnections.id, platform: socialConnections.platform }).from(socialConnections).where(eq(socialConnections.projectId, ctx.projectId)),
  );
  const connectionIds = args.platforms.map((platform) => {
    const match = connections.find((c) => c.platform === platform);
    if (!match) {
      const connected = connections.map((c) => c.platform).join(", ") || "none";
      throw new Error(`"${platform}" isn't a connected social platform for this project. Connected: ${connected}.`);
    }
    return match.id;
  });

  return createSocialPost(ctx.userId, ctx.projectId, { text: args.text, mediaUrls: [], connectionIds });
}

// The one write tool that never requires confirmation - it only ever
// touches Cappy's own internal cappyProjectNotes row (this project's AI
// assistant memory), never user-facing SEO/customer data. The model
// supplies the full replacement summary itself (it already did the
// summarizing as part of deciding to call this), so this just persists it
// - matches the same threshold/cap this project's automatic refresh uses
// (see apps/web/lib/cappy/project-notes.ts).
const MAX_SUMMARY_CHARS = 4000;

export async function writeUpdateProjectNotes(ctx: CappyToolContext, args: { summary: string }) {
  const summary = args.summary.slice(0, MAX_SUMMARY_CHARS);
  await withUserContext(ctx.userId, (tx) =>
    tx
      .insert(cappyProjectNotes)
      .values({ projectId: ctx.projectId, summary, updatedAt: new Date() })
      .onConflictDoUpdate({ target: cappyProjectNotes.projectId, set: { summary, updatedAt: new Date() } }),
  );
  return { ok: true };
}
