import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@rosterseo/db";
import { getProvider } from "@rosterseo/ai-visibility";
import { requireProjectAccess, withAuth } from "@/lib/api-utils";
import { CAPPY_PROVIDER_IDS, resolveCappyModel, resolveCappyProvider } from "@/lib/cappy/provider";

type RouteParams = { projectId: string };

// GET   - which provider/model this project's Cappy uses, plus which of the
//         3 tool-calling-capable providers are actually configured (env
//         vars set) - the settings UI disables any option that isn't.
// PATCH - change them.
export const GET = withAuth<RouteParams>(async (_req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = resolveCappyProvider(project.cappyProvider);
  const configuredProviders = CAPPY_PROVIDER_IDS.filter((id) => getProvider(id)?.isConfigured());

  return NextResponse.json({
    provider,
    model: resolveCappyModel(project.cappyModel, provider),
    isCustomModel: !!project.cappyModel?.trim(),
    configuredProviders,
  });
});

export const PATCH = withAuth<RouteParams>(async (req, ctx, session) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  if (!CAPPY_PROVIDER_IDS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${CAPPY_PROVIDER_IDS.join(", ")}` }, { status: 400 });
  }
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;

  await withUserContext(session.user.id, (tx) => tx.update(projects).set({ cappyProvider: provider, cappyModel: model }).where(eq(projects.id, projectId)));

  return NextResponse.json({ ok: true });
});
