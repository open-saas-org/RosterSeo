import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@rosterseo/db";
import { generateIndexNowKey, submitUrlsToIndexNow } from "@rosterseo/indexnow";
import { withAuth, requireProjectAccess } from "@/lib/api-utils";

// POST /api/projects/:projectId/indexnow/submit - body: { urls: string[] }.
// Generates+saves a real IndexNow key on first use (lazy - most projects
// never touch this), then submits the real URLs to IndexNow's shared
// endpoint. `keyLocation` is this same app's own /api/indexnow/[key] route
// (doesn't need to live on the customer's own domain - see that route's
// comment), derived from the live request's own origin so it works in any
// deployment (self-hosted custom domain or otherwise) without a hardcoded
// app-URL env var.

type RouteParams = { projectId: string };

export const POST = withAuth<RouteParams>(async (req: NextRequest, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const urls: string[] = Array.isArray(body?.urls) ? body.urls.filter((u: unknown) => typeof u === "string" && u.trim()) : [];
  if (urls.length === 0) {
    return NextResponse.json({ error: "urls is required and must be a non-empty array" }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(urls[0]!).host;
  } catch {
    return NextResponse.json({ error: "urls must be absolute URLs" }, { status: 400 });
  }
  const mismatched = urls.some((u) => {
    try {
      return new URL(u).host !== host;
    } catch {
      return true;
    }
  });
  if (mismatched) {
    return NextResponse.json({ error: "All urls must share the same host for one IndexNow submission" }, { status: 400 });
  }

  let key = project.indexnowKey;
  if (!key) {
    key = generateIndexNowKey();
    await withUserContext(session.user.id, (tx) => tx.update(projects).set({ indexnowKey: key }).where(eq(projects.id, projectId)));
  }

  const keyLocation = new URL(`/api/indexnow/${key}`, req.nextUrl.origin).toString();

  try {
    await submitUrlsToIndexNow(host, key, keyLocation, urls);
    return NextResponse.json({ submitted: urls.length });
  } catch (err) {
    console.error("IndexNow submission failed", err);
    return NextResponse.json({ error: "indexnow_submit_failed" }, { status: 502 });
  }
});
