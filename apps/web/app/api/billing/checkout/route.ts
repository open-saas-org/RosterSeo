import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { getStripe } from "@/lib/stripe";
import { isSelfHosted } from "@/lib/self-hosted";
import { PLANS } from "@/lib/plans";

// POST /api/billing/checkout - creates a real Stripe Checkout Session for
// a subscription and redirects the user there. Only reachable in hosted
// mode (SELF_HOSTED=false) - self-hosted installs have no billing concept
// at all, see apps/web/lib/self-hosted.ts.
const bodySchema = z.object({ planId: z.enum(["starter", "pro", "agency"]) });

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
  const priceId = plan?.stripePriceEnvVar ? process.env[plan.stripePriceEnvVar] : undefined;
  if (!priceId) {
    return NextResponse.json({ error: `No Stripe price configured for plan "${parsed.data.planId}" (set ${plan?.stripePriceEnvVar}).` }, { status: 500 });
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    return NextResponse.json({ error: "No organization found for this account." }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id is how the webhook (checkout.session.completed)
    // maps this session back to a RosterSEO organization - Stripe's own
    // customer id doesn't exist yet at Checkout-creation time for a new
    // subscriber.
    client_reference_id: org.id,
    customer: org.stripeCustomerId ?? undefined,
    customer_email: org.stripeCustomerId ? undefined : session.user.email,
    success_url: `${appUrl}/settings/billing?checkout=success`,
    cancel_url: `${appUrl}/settings/billing?checkout=cancelled`,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
