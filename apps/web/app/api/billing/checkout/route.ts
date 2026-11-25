import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { organizations, withSystemContext } from "@rosterseo/db";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { createCashfreeSubscription, getCashfreeMode } from "@/lib/cashfree";
import { isSelfHosted } from "@/lib/self-hosted";
import { isPaidPlanActive, PLANS } from "@/lib/plans";

// POST /api/billing/checkout - creates a Cashfree recurring subscription
// session and returns the subscriptionSessionId for the Cashfree JS SDK.
// Only reachable in hosted mode (SELF_HOSTED=false).
const bodySchema = z.object({
  planId: z.enum(["starter", "pro", "agency"]),
  customerPhone: z.string().trim().min(8).max(15).optional(),
});

export async function POST(req: NextRequest) {
  if (isSelfHosted()) {
    return NextResponse.json({ error: "Billing isn't available on a self-hosted install." }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const plan = PLANS.find((p) => p.id === parsed.data.planId);
  const cashfreePlanId = plan?.cashfreePlanEnvVar ? process.env[plan.cashfreePlanEnvVar] : undefined;
  if (!cashfreePlanId) {
    return NextResponse.json(
      { error: `No Cashfree plan configured for "${parsed.data.planId}" (set ${plan?.cashfreePlanEnvVar}).` },
      { status: 500 },
    );
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const subscriptionId = `sub_${org.id.replace(/-/g, "").slice(0, 12)}_${parsed.data.planId}_${Date.now()}`;
  const returnUrl = `${appUrl}/settings/billing?checkout=success&subscription_id=${encodeURIComponent(subscriptionId)}&plan_id=${parsed.data.planId}`;

  const cfSubscription = await createCashfreeSubscription({
    subscriptionId,
    planId: cashfreePlanId,
    customerName: session.user.name || org.name,
    customerEmail: session.user.email,
    customerPhone: parsed.data.customerPhone || "9999999999",
    returnUrl,
  });

  if (!cfSubscription.subscription_session_id) {
    return NextResponse.json({ error: "Cashfree did not return a subscription session ID." }, { status: 502 });
  }

  // If the org isn't on an active paid plan yet, record the pending
  // subscriptionId so the Cashfree webhook can match and activate the org
  // even if the user closes the tab before returning to return_url.
  if (!isPaidPlanActive(org)) {
    await withSystemContext((tx) =>
      tx
        .update(organizations)
        .set({ stripeSubscriptionId: subscriptionId })
        .where(eq(organizations.id, org.id)),
    );
  }

  return NextResponse.json({
    subscriptionSessionId: cfSubscription.subscription_session_id,
    subscriptionId: cfSubscription.subscription_id,
    mode: getCashfreeMode(),
  });
}
