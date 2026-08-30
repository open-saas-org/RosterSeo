import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { projectCompetitors, withUserContext } from "@rosterseo/db";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { addCompetitor } from "@/lib/competitors/add-competitor";
import { isValidDomain, normalizeDomain } from "@/components/competitors/domain-utils";

// Persists the tracked-competitor list for a project (the domains shown in
// the summary table on the /competitors page). The page loads the initial
// list server-side and add/remove in competitor-workspace.tsx POST/DELETE
// against this route directly. Domain *stats* (traffic, backlinks, keyword
// ideas) are a separate concern, fetched straight from @rosterseo/dataforseo
// via a Server Action - see app/(dashboard)/competitors/actions.ts.

export const GET = withAuth<{ projectId: string }>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const competitors = await withUserContext(session.user.id, (tx) =>
    tx
      .select()
      .from(projectCompetitors)
      .where(eq(projectCompetitors.projectId, projectId))
      .orderBy(desc(projectCompetitors.createdAt)),
  );

  return NextResponse.json({ competitors });
});

export const POST = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const rawDomain = typeof body?.domain === "string" ? body.domain : "";
  const name = typeof body?.name === "string" ? body.name : undefined;

  try {
    const competitor = await addCompetitor(session.user.id, projectId, rawDomain, name);
    return NextResponse.json({ competitor }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that competitor.";
    return NextResponse.json({ error: message }, { status: message.includes("already tracked") ? 409 : 400 });
  }
});

// Trims, drops empties/dupes, caps list length - same free-typed chip-list
// hygiene the brand route (ai-visibility/brand/route.ts) enforces for
// projects.aiVisibilityAliases/aiVisibilityAdditionalDomains.
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

// PATCH - edits an existing tracked competitor: name, domain, aliases, and/
// or additionalDomains (see projectCompetitors in app-schema.ts). Every
// field is optional so a caller can send a partial update. `additionalDomains`
// replaces the whole list (the Competitors settings row editor always sends
// its full edited list); `addDomain` instead appends one domain to whatever
// that competitor already has - the one-click "Track domain" action in
// Citations' Top Domains card (citations-dashboard.tsx) uses `addDomain` so
// it doesn't need to fetch the competitor's current list first. If both are
// present, `additionalDomains` wins (applied after). Body: { id: string,
// name?, domain?, aliases?, additionalDomains?, addDomain? }.
export const PATCH = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
  }

  const updates: Partial<typeof projectCompetitors.$inferInsert> = {};

  if (typeof body?.domain === "string") {
    const domain = normalizeDomain(body.domain);
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Enter a valid domain, e.g. example.com" }, { status: 400 });
    }
    updates.domain = domain;
  }
  if (typeof body?.name === "string") {
    updates.name = body.name.trim() || null;
  }
  const aliases = sanitizeStringList(body?.aliases, 20);
  if (aliases !== null) updates.aliases = aliases.length > 0 ? aliases : null;
  const additionalDomains = sanitizeDomainList(body?.additionalDomains, 20);
  const addDomain = typeof body?.addDomain === "string" ? normalizeDomain(body.addDomain) : null;

  if (Object.keys(updates).length === 0 && additionalDomains === null && !addDomain) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const [updated] = await withUserContext(session.user.id, async (tx) => {
      if (addDomain) {
        const [existing] = await tx.select().from(projectCompetitors).where(and(eq(projectCompetitors.id, id), eq(projectCompetitors.projectId, projectId))).limit(1);
        if (existing) {
          const current = existing.additionalDomains ?? [];
          if (!current.includes(addDomain)) updates.additionalDomains = [...current, addDomain].slice(0, 20);
        }
      }
      if (additionalDomains !== null) updates.additionalDomains = additionalDomains.length > 0 ? additionalDomains : null;

      if (Object.keys(updates).length === 0) return [];
      return tx
        .update(projectCompetitors)
        .set(updates)
        .where(and(eq(projectCompetitors.id, id), eq(projectCompetitors.projectId, projectId)))
        .returning();
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ competitor: updated });
  } catch {
    return NextResponse.json({ error: "That domain is already tracked for this project." }, { status: 409 });
  }
});

export const DELETE = withAuth<{ projectId: string }>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const competitorId = req.nextUrl.searchParams.get("id");
  if (!competitorId) {
    return NextResponse.json({ error: "Missing required query param: id" }, { status: 400 });
  }

  const deleted = await withUserContext(session.user.id, (tx) =>
    tx
      .delete(projectCompetitors)
      .where(and(eq(projectCompetitors.id, competitorId), eq(projectCompetitors.projectId, projectId)))
      .returning(),
  );

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
