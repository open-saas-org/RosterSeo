import { NextRequest, NextResponse } from "next/server";
import { listOpenRouterModels } from "@seo-tool/ai-visibility";
import { auth } from "@/lib/auth";

// GET /api/ai-visibility/openrouter-models - OpenRouter's real, public
// model catalog (no API key required to list, though a key is still needed
// to actually call one) - not project-scoped, same "static route, instance-
// wide" reasoning as /api/spend. Powers Settings -> Providers' OpenRouter
// model picker so a project can search real models instead of needing to
// already know an exact slug to type in.

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const models = await listOpenRouterModels();
    return NextResponse.json({ models });
  } catch (err) {
    console.error("[openrouter-models] real fetch failed:", err);
    return NextResponse.json({ error: "Couldn't fetch OpenRouter's model list right now." }, { status: 502 });
  }
}
