import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizations, withSystemContext } from "@rosterseo/db";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { cancelCashfreeSubscription } from "@/lib/cashfree";
import { isSelfHosted } from "@/lib/self-hosted";

// POST /api/billing/cancel - cancels the organization's active Cashfree
// recurring subscription and downgrades the org back to the free plan.
export async function POST(req: NextRequest) {
  if (isSelfHosted()) {
    return NextResponse.json({ error: "Billing isn't available on a self-hosted install." }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });
  }
  if (!org.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });
  }

  await cancelCashfreeSubscription(org.stripeSubscriptionId);

  await withSystemContext((tx) =>
    tx
      .update(organizations)
      .set({
        subscriptionStatus: "canceled",
        planId: "free",
        stripeSubscriptionId: null,
      })
      .where(eq(organizations.id, org.id)),
  );

  return NextResponse.json({ ok: true });
}
