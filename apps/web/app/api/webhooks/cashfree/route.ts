import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizations, withSystemContext } from "@rosterseo/db";
import { verifyCashfreeWebhookSignature } from "@/lib/cashfree";
import { getPlanByCashfreePlanId } from "@/lib/plans";
import { isSelfHosted } from "@/lib/self-hosted";

// POST /api/webhooks/cashfree - unauthenticated server-to-server webhook
// from Cashfree, verified via HMAC-SHA256 signature headers.
export async function POST(req: NextRequest) {
  if (isSelfHosted()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!verifyCashfreeWebhookSignature(signature, timestamp, rawBody)) {
    console.error("[cashfree webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const eventType = typeof payload.type === "string" ? payload.type : "";
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const subDetails =
    data.subscription_details && typeof data.subscription_details === "object"
      ? (data.subscription_details as Record<string, unknown>)
      : data;

  const subscriptionId =
    typeof subDetails.subscription_id === "string" ? subDetails.subscription_id : null;
  if (!subscriptionId) {
    return NextResponse.json({ received: true });
  }

  const cfStatus =
    typeof subDetails.subscription_status === "string"
      ? subDetails.subscription_status.toUpperCase()
      : "";
  const planDetails =
    subDetails.plan_details && typeof subDetails.plan_details === "object"
      ? (subDetails.plan_details as Record<string, unknown>)
      : null;
  const cfPlanId = typeof planDetails?.plan_id === "string" ? planDetails.plan_id : null;
  const mappedPlan = cfPlanId ? getPlanByCashfreePlanId(cfPlanId) : null;

  try {
    if (eventType === "SUBSCRIPTION_PAYMENT_FAILED") {
      await withSystemContext((tx) =>
        tx
          .update(organizations)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(organizations.stripeSubscriptionId, subscriptionId)),
      );
    } else if (cfStatus === "ACTIVE" || eventType === "SUBSCRIPTION_PAYMENT_SUCCESS") {
      await withSystemContext((tx) =>
        tx
          .update(organizations)
          .set({
            subscriptionStatus: "active",
            ...(mappedPlan ? { planId: mappedPlan.id } : {}),
          })
          .where(eq(organizations.stripeSubscriptionId, subscriptionId)),
      );
    } else if (cfStatus === "CANCELLED" || cfStatus === "EXPIRED" || cfStatus === "COMPLETED") {
      await withSystemContext((tx) =>
        tx
          .update(organizations)
          .set({
            subscriptionStatus: "canceled",
            planId: "free",
            stripeSubscriptionId: null,
          })
          .where(eq(organizations.stripeSubscriptionId, subscriptionId)),
      );
    } else if (cfStatus === "ON_HOLD" || cfStatus === "PAUSED") {
      await withSystemContext((tx) =>
        tx
          .update(organizations)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(organizations.stripeSubscriptionId, subscriptionId)),
      );
    }
  } catch (err) {
    console.error(`[cashfree webhook] failed to handle ${eventType}`, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
