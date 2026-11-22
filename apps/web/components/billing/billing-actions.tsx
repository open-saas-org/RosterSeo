"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PLANS, type Plan } from "@/lib/plans";

async function redirectToUrl(url: string) {
  window.location.href = url;
}

// "Upgrade"/"Change plan" buttons for every purchasable plan other than
// the org's current one, plus a "Manage billing" button once a real
// Stripe customer exists. Both hit the checkout/portal routes
// (apps/web/app/api/billing/*) and redirect to the URL Stripe returns -
// there's no in-app checkout form, Stripe Checkout/Portal are the real UI.
export function BillingActions({ currentPlanId, hasStripeCustomer }: { currentPlanId: string; hasStripeCustomer: boolean }) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchasable = PLANS.filter((p): p is Plan & { priceUsd: number } => p.priceUsd !== null);

  async function startCheckout(planId: string) {
    setError(null);
    setLoadingPlanId(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed.");
      await redirectToUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setLoadingPlanId(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't open the billing portal.");
      await redirectToUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the billing portal.");
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {purchasable.map((plan) => (
          <Button
            key={plan.id}
            type="button"
            variant={plan.id === currentPlanId ? "outline" : "default"}
            disabled={plan.id === currentPlanId || loadingPlanId !== null}
            onClick={() => startCheckout(plan.id)}
          >
            {plan.id === currentPlanId ? `Current: ${plan.name}` : loadingPlanId === plan.id ? "Redirecting…" : `Choose ${plan.name} — $${plan.priceUsd}/mo`}
          </Button>
        ))}
        {hasStripeCustomer ? (
          <Button type="button" variant="outline" disabled={portalLoading} onClick={openPortal}>
            {portalLoading ? "Opening…" : "Manage billing"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
