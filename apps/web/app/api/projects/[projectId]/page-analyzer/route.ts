import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { pageAnalyzerReports, googleConnections, withUserContext } from "@seo-tool/db";
import { isGoogleOAuthConfigured } from "@seo-tool/google";
import { isDataForSeoConfigured, resolveLocationCode } from "@seo-tool/dataforseo";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";
import { toConnectionStatus } from "@/lib/google-connection-status";
import { getValidAccessToken } from "@/lib/google-token";
import { resolveDomainSnapshot } from "@/lib/domain-snapshot";
import { buildPageAnalyzerResult } from "@/components/page-analyzer/analysis";

type RouteParams = { projectId: string };

function parseBody(body: unknown): { url: string; targetKeyword: string; targetLocation?: string } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }
  const { url, targetKeyword, targetLocation } = body as Record<string, unknown>;

  if (typeof url !== "string" || !url.trim()) {
    return { error: "'url' is required." };
  }
  try {
    new URL(url);
  } catch {
    return { error: "'url' must be a valid absolute URL." };
  }
  if (typeof targetKeyword !== "string" || !targetKeyword.trim()) {
    return { error: "'targetKeyword' is required." };
  }
  if (targetLocation !== undefined && typeof targetLocation !== "string") {
    return { error: "'targetLocation' must be a string when provided." };
  }

  return {
    url: url.trim(),
    targetKeyword: targetKeyword.trim(),
    targetLocation: targetLocation?.trim() || undefined,
  };
}

// Resolves the project's real, already-refreshed GSC/GA4/Merchant Center
// access tokens (if connected) - same toConnectionStatus()/
// getValidAccessToken() path every other Google-data page in this app
// uses, so "connected" here can never disagree with the Integrations page.
// Returns null for a service that isn't connected/configured -
// buildPageAnalyzerResult treats that as an honest "not_connected", never
// a fake zero.
async function resolveGoogleContext(
  userId: string,
  project: { organizationId: string; gscPropertyId: string | null; ga4PropertyId: string | null; merchantAccountId: string | null },
) {
  if (!isGoogleOAuthConfigured()) return { gsc: null, ga4: null, merchant: null };

  const connections = await withUserContext(userId, (tx) =>
    tx.select().from(googleConnections).where(eq(googleConnections.organizationId, project.organizationId)),
  );
  const gscConn = connections.find((c) => c.service === "gsc");
  const ga4Conn = connections.find((c) => c.service === "ga4");
  const merchantConn = connections.find((c) => c.service === "merchant");
  const gscStatus = toConnectionStatus(gscConn, project.gscPropertyId, "gsc");
  const ga4Status = toConnectionStatus(ga4Conn, project.ga4PropertyId, "ga4");
  const merchantStatus = toConnectionStatus(merchantConn, project.merchantAccountId, "merchant");

  let gsc: { accessToken: string; siteUrl: string } | null = null;
  let ga4: { accessToken: string; propertyId: string } | null = null;
  let merchant: { accessToken: string; merchantAccountId: string } | null = null;

  if (gscStatus.status === "connected" && gscStatus.propertyId && gscConn) {
    try {
      gsc = { accessToken: await getValidAccessToken(userId, gscConn), siteUrl: gscStatus.propertyId };
    } catch (err) {
      console.error("page-analyzer: failed to get a valid GSC access token", err);
    }
  }
  if (ga4Status.status === "connected" && ga4Status.propertyId && ga4Conn) {
    try {
      ga4 = { accessToken: await getValidAccessToken(userId, ga4Conn), propertyId: ga4Status.propertyId };
    } catch (err) {
      console.error("page-analyzer: failed to get a valid GA4 access token", err);
    }
  }
  if (merchantStatus.status === "connected" && merchantStatus.propertyId && merchantConn) {
    try {
      merchant = { accessToken: await getValidAccessToken(userId, merchantConn), merchantAccountId: merchantStatus.propertyId };
    } catch (err) {
      console.error("page-analyzer: failed to get a valid Merchant Center access token", err);
    }
  }

  return { gsc, ga4, merchant };
}

// POST /api/projects/:projectId/page-analyzer
// Runs a real page-analyzer report (real crawl + SERP pull + rule-based
// fix-it plan + structured LLM guidance + real GSC/GA4 page metrics, see
// components/page-analyzer/analysis.ts) and persists it. The row is
// written as "running" and this responds immediately with it - the actual
// pipeline (11 real crawls, SERP, PageSpeed, an LLM call) runs in the
// background of this same long-lived Node process and flips the row to
// "complete"/"failed" when done, so the client can navigate to the report
// page right away and poll it instead of blocking on one long request.
// This is in-process fire-and-forget, not a durable queue - a restart of
// this process mid-run leaves the row stuck "running" (same tradeoff the
// old synchronous version had if the request itself was killed; PRD
// Section 6's real job-queue version is a separate, larger future change).
export const POST = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { url, targetKeyword, targetLocation } = parsed;

  const [pending] = await withUserContext(session.user.id, (tx) =>
    tx
      .insert(pageAnalyzerReports)
      .values({
        projectId,
        url,
        targetKeyword,
        targetLocation: targetLocation ?? null,
        status: "running",
      })
      .returning(),
  );

  const { gsc, ga4, merchant } = await resolveGoogleContext(session.user.id, project);

  // Real competitor-domain-authority sizing (apps/web/lib/domain-snapshot.ts,
  // same cache table the Competitors page uses) - a plain userId/projectId
  // closure, not a pre-resolved value, since buildPageAnalyzerResult itself
  // resolves the target's own location code and doesn't know the
  // competitor domains until its own real SERP call runs. Only handed in
  // when DataForSEO is configured at all - otherwise every lookup would
  // just throw, no different from omitting it.
  const userId = session.user.id;
  const domainSnapshotResolver = isDataForSeoConfigured()
    ? async (domain: string) => resolveDomainSnapshot(userId, projectId, domain, await resolveLocationCode(targetLocation))
    : undefined;

  buildPageAnalyzerResult({ url, targetKeyword, targetLocation, gsc, ga4, merchant, resolveDomainSnapshot: domainSnapshotResolver })
    .then((result) =>
      withUserContext(session.user.id, (tx) =>
        tx.update(pageAnalyzerReports).set({ status: "complete", result }).where(eq(pageAnalyzerReports.id, pending!.id)),
      ),
    )
    .catch((err) => {
      console.error("page-analyzer run failed", err);
      return withUserContext(session.user.id, (tx) =>
        tx.update(pageAnalyzerReports).set({ status: "failed" }).where(eq(pageAnalyzerReports.id, pending!.id)),
      );
    });

  return NextResponse.json({ report: pending }, { status: 201 });
});

// GET /api/projects/:projectId/page-analyzer
// Lists past reports for a project, most recent first.
export const GET = withAuth<RouteParams>(async (_req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;

  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const reports = await withUserContext(session.user.id, (tx) =>
    tx
      .select()
      .from(pageAnalyzerReports)
      .where(eq(pageAnalyzerReports.projectId, projectId))
      .orderBy(desc(pageAnalyzerReports.createdAt)),
  );

  return NextResponse.json({ reports });
});
