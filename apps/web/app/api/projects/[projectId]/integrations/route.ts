import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { googleConnections, projects, withUserContext } from "@seo-tool/db";
import { isGoogleOAuthConfigured } from "@seo-tool/google";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";

// GET    /api/projects/:projectId/integrations - GSC + GA4 + GBP + Merchant Center connection status
// PATCH  /api/projects/:projectId/integrations - set this project's property
// DELETE /api/projects/:projectId/integrations?service=gsc|ga4|gbp|merchant - disconnect
//        the organization's Google account (affects every project under it,
//        not just this one - see the "Property selection" note in the docs
//        for why the connection itself is account-level).
//
// GBP has no per-project "property" of its own here - Local SEO runs on
// DataForSEO instead of this connection (see /docs/local-seo) - so it only
// ever appears in the GET status list and DELETE, never PATCH. Merchant
// Center DOES have a per-project pick (which account's product performance
// this project reports on, see /merchant-insights), same shape as gsc/ga4.

type RouteParams = { projectId: string };

export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const connections = await withUserContext(session.user.id, async (tx) => {
    return tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId));
  });

  const byService = new Map(connections.map((c) => [c.service, c]));

  return NextResponse.json({
    configured: isGoogleOAuthConfigured(),
    connections: [
      toConnectionStatus(byService.get("gsc"), project.gscPropertyId, "gsc"),
      toConnectionStatus(byService.get("ga4"), project.ga4PropertyId, "ga4"),
      // No per-project property for gbp - it's connect/disconnect only,
      // dormant plumbing for a future GBP-connected feature (Local SEO
      // itself runs on DataForSEO, not this connection).
      toConnectionStatus(byService.get("gbp"), null, "gbp"),
      toConnectionStatus(byService.get("merchant"), project.merchantAccountId, "merchant"),
    ],
  });
});

// Body: { service: "gsc" | "ga4" | "merchant", propertyId: string }. Sets
// which property/account THIS project syncs, picked from the
// organization's shared connection. Requires that connection to already
// exist - a project can't pick a property for a service its org has never
// connected.
export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const service = body?.service;
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";

  if (service !== "gsc" && service !== "ga4" && service !== "merchant") {
    return NextResponse.json({ error: "service must be 'gsc', 'ga4', or 'merchant'" }, { status: 400 });
  }
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }

  const result = await withUserContext(session.user.id, async (tx) => {
    const [connection] = await tx
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, service)))
      .limit(1);
    if (!connection) return null;

    const columnUpdate =
      service === "gsc" ? { gscPropertyId: propertyId } : service === "ga4" ? { ga4PropertyId: propertyId } : { merchantAccountId: propertyId };
    const [row] = await tx.update(projects).set(columnUpdate).where(eq(projects.id, projectId)).returning();
    return { connection, project: row };
  });

  if (!result) {
    return NextResponse.json({ error: "No connection to update - connect first" }, { status: 404 });
  }

  const savedPropertyId =
    service === "gsc" ? result.project.gscPropertyId : service === "ga4" ? result.project.ga4PropertyId : result.project.merchantAccountId;

  return NextResponse.json({
    connection: toConnectionStatus(result.connection, savedPropertyId, service),
  });
});

export const DELETE = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const service = new URL(req.url).searchParams.get("service");
  if (service !== "gsc" && service !== "ga4" && service !== "gbp" && service !== "merchant") {
    return NextResponse.json({ error: "service query param must be 'gsc', 'ga4', 'gbp', or 'merchant'" }, { status: 400 });
  }

  await withUserContext(session.user.id, async (tx) => {
    await tx
      .delete(googleConnections)
      .where(and(eq(googleConnections.organizationId, project.organizationId), eq(googleConnections.service, service)));

    // The property/account pick is per-project, but the connection it was
    // picked FROM is org-wide - leaving a stale gscPropertyId/ga4PropertyId/
    // merchantAccountId behind on every project meant reconnecting with a
    // DIFFERENT Google account instantly looked "connected, property
    // already picked" using the old account's property id. Every
    // subsequent real fetch against that mismatched id then failed and got
    // misclassified as "needs reconnect," sending the user through a
    // pointless re-auth loop instead of the real fix (re-pick a property).
    // gbp has no per-project property column - nothing to clear there.
    if (service === "gsc") {
      await tx.update(projects).set({ gscPropertyId: null }).where(eq(projects.organizationId, project.organizationId));
    } else if (service === "ga4") {
      await tx.update(projects).set({ ga4PropertyId: null }).where(eq(projects.organizationId, project.organizationId));
    } else if (service === "merchant") {
      await tx.update(projects).set({ merchantAccountId: null }).where(eq(projects.organizationId, project.organizationId));
    }
  });

  return NextResponse.json({ ok: true });
});
