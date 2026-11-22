import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organizations, withSystemContext } from "@rosterseo/db";
import { getStripe } from "@/lib/stripe";
import { getPlanByStripePrice } from "@/lib/plans";
import { isSelfHosted } from "@/lib/self-hosted";

// POST /api/webhooks/stripe - the one route in this codebase intentionally
// unauthenticated by user session: Stripe calls this directly, with no
// cookie, verified instead by its own signature header against
// STRIPE_WEBHOOK_SECRET. See packages/db/src/with-system-context.ts for
// why this needs its own narrow RLS exception rather than withUserContext.
export async function POST(req: NextRequest) {
  if (isSelfHosted()) {
    // A self-hosted install has no STRIPE_WEBHOOK_SECRET configured and
    // should never receive these - 404 rather than 200, so a
    // misconfigured Stripe webhook pointed at a self-hosted deploy fails
    // loudly instead of looking like it worked.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const organizationId = checkoutSession.client_reference_id;
        const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;
        const subscriptionId =
          typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;
        if (!organizationId || !customerId) break;

        // The price id lives on the subscription's line items, not the
        // Checkout Session itself - a second real Stripe call, but this
        // only happens once per subscription creation, not per request.
        let planId = "starter";
        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          if (priceId) planId = getPlanByStripePrice(priceId)?.id ?? planId;
        }

        await withSystemContext((tx) =>
          tx
            .update(organizations)
            .set({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId ?? null, planId, subscriptionStatus: "active" })
            .where(eq(organizations.id, organizationId)),
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? getPlanByStripePrice(priceId) : null;

        await withSystemContext((tx) =>
          tx
            .update(organizations)
            .set({
              subscriptionStatus: subscription.status,
              ...(plan ? { planId: plan.id } : {}),
            })
            .where(eq(organizations.stripeCustomerId, customerId)),
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

        await withSystemContext((tx) =>
          tx
            .update(organizations)
            .set({ subscriptionStatus: "canceled", planId: "free", stripeSubscriptionId: null })
            .where(eq(organizations.stripeCustomerId, customerId)),
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        // No feature cutoff here - just flips the status flag for a
        // future in-app banner (ROADMAP.md Phase 2). Stripe's own retry
        // schedule / dunning emails handle the actual collection attempt.
        await withSystemContext((tx) =>
          tx.update(organizations).set({ subscriptionStatus: "past_due" }).where(eq(organizations.stripeCustomerId, customerId)),
        );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] failed to handle ${event.type}`, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
