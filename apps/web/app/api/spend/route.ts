import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSpendSummary } from "@/lib/spend-data";

// GET /api/spend - real (or clearly-flagged-estimated) API spend across
// every external provider this deployment pays for. Instance-wide, not
// project-scoped - see packages/db/src/app-schema.ts's providerSpendLog
// comment for why there's no project_id to scope by in the first place.
// Static route (no [id] segment), same reasoning as /api/mcp-keys.

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await getSpendSummary();
  return NextResponse.json(summary);
}
