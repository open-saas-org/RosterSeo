import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { getProvider } from "@seo-tool/ai-visibility";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { CLAY_PROVIDER_IDS, resolveClayModel, resolveClayProvider } from "@/lib/clay/provider";

type RouteParams = { projectId: string };

// GET   - which provider/model this project's Clay uses, plus which of the
//         3 tool-calling-capable providers are actually configured (env
//         vars set) - the settings UI disables any option that isn't.
// PATCH - change them.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = resolveClayProvider(project.clayProvider);
  const configuredProviders = CLAY_PROVIDER_IDS.filter((id) => getProvider(id)?.isConfigured());

  return NextResponse.json({
    provider,
    model: resolveClayModel(project.clayModel, provider),
    isCustomModel: !!project.clayModel?.trim(),
    configuredProviders,
  });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  if (!CLAY_PROVIDER_IDS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${CLAY_PROVIDER_IDS.join(", ")}` }, { status: 400 });
  }
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;

  await withUserContext(session.user.id, (tx) => tx.update(projects).set({ clayProvider: provider, clayModel: model }).where(eq(projects.id, projectId)));

  return NextResponse.json({ ok: true });
});
