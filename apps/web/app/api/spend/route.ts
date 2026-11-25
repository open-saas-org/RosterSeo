import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSelfHosted } from "@/lib/self-hosted";
import { getSpendSummary } from "@/lib/spend-data";

// GET /api/spend - real (or clearly-flagged-estimated) API spend across
// every external provider this deployment pays for. Instance-wide, not
// project-scoped - gated to self-hosted mode so hosted SaaS tenants cannot
// read deployment-wide API spend across other organizations.
export async function GET(req: NextRequest) {
  if (!isSelfHosted()) {
    return NextResponse.json({ error: "Not available in hosted mode." }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await getSpendSummary();
  return NextResponse.json(summary);
}
