import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@rosterseo/db";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { normalizeDomain } from "@/components/competitors/domain-utils";

// PATCH /api/projects/:projectId/ai-visibility/brand - saves free-text
// brand context fed into AI Visibility's sampling/fan-out/opportunity
// prompts, plus brand identity used by Citations' classifyUrl (aliases +
// additionalDomains - see packages/db/src/app-schema.ts for what each
// feeds). Body: { context?: string, aliases?: string[], additionalDomains?:
// string[], addDomain?: string }. Any field omitted from the body is left
// unchanged. `additionalDomains` replaces the whole list (the Brand settings
// form always sends its full edited list); `addDomain` instead appends one
// domain to whatever's already saved - the one-click "Track domain" action
// in Citations' Top Domains card (citations-dashboard.tsx) uses `addDomain`
// so it doesn't need to know/refetch the current list first. If both are
// present, `additionalDomains` wins (applied after).

type RouteParams = { projectId: string };

// Trims, drops empties/dupes, caps list length - mirrors the tag-list
// hygiene ai-visibility-prompts-workspace.tsx's TagEditor relies on the
// server to also enforce, since these are also free-typed chip lists.
function sanitizeStringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, 200);
    if (trimmed) seen.add(trimmed);
    if (seen.size >= max) break;
  }
  return [...seen];
}

function sanitizeDomainList(value: unknown, max: number): string[] | null {
  const list = sanitizeStringList(value, max);
  if (list === null) return null;
  return [...new Set(list.map((d) => normalizeDomain(d)).filter(Boolean))];
}

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  const updates: Partial<typeof projects.$inferInsert> = {};
  if (typeof body?.context === "string") {
    updates.aiVisibilityContext = body.context.trim().slice(0, 2000) || null;
  }
  const aliases = sanitizeStringList(body?.aliases, 20);
  if (aliases !== null) updates.aiVisibilityAliases = aliases.length > 0 ? aliases : null;

  if (typeof body?.addDomain === "string") {
    const domain = normalizeDomain(body.addDomain);
    if (domain) {
      const current = project.aiVisibilityAdditionalDomains ?? [];
      if (!current.includes(domain)) updates.aiVisibilityAdditionalDomains = [...current, domain].slice(0, 20);
    }
  }
  const additionalDomains = sanitizeDomainList(body?.additionalDomains, 20);
  if (additionalDomains !== null) updates.aiVisibilityAdditionalDomains = additionalDomains.length > 0 ? additionalDomains : null;

  const [updated] = await withUserContext(session.user.id, (tx) =>
    tx.update(projects).set(updates).where(eq(projects.id, projectId)).returning(),
  );

  return NextResponse.json({ project: updated });
});
