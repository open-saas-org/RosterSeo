import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { getStripe } from "@/lib/stripe";
import { isSelfHosted } from "@/lib/self-hosted";

// POST /api/billing/portal - creates a Stripe Billing Portal session so a
// subscribed org can manage/cancel their own subscription without a
// custom UI for it. Requires a real stripeCustomerId already on the org
// (i.e. they've completed Checkout at least once) - there's nothing to
// manage otherwise.
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
  if (!org.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription yet - choose a plan first." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  const portalSession = await getStripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
