"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { openCashfreeSubscriptionCheckout } from "@/lib/cashfree-client";
import { PLANS, type Plan } from "@/lib/plans";

export function BillingActions({
  currentPlanId,
  subscriptionStatus = "active",
  hasActiveSubscription,
}: {
  currentPlanId: string;
  subscriptionStatus?: string;
  hasActiveSubscription: boolean;
}) {
  const router = useRouter();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
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
      await openCashfreeSubscriptionCheckout(data.subscriptionSessionId, data.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setLoadingPlanId(null);
    }
  }

  async function cancelSubscription() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setError(null);
    setCancelLoading(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't cancel the subscription.");
      setConfirmCancel(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the subscription.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {purchasable.map((plan) => {
          const isCurrent = plan.id === currentPlanId && subscriptionStatus === "active";
          return (
            <Button
              key={plan.id}
              type="button"
              variant={isCurrent ? "outline" : "default"}
              disabled={isCurrent || loadingPlanId !== null}
              onClick={() => startCheckout(plan.id)}
            >
              {isCurrent
                ? `Current: ${plan.name}`
                : loadingPlanId === plan.id
                  ? "Redirecting…"
                  : `Choose ${plan.name} — $${plan.priceUsd}/mo`}
            </Button>
          );
        })}
        {hasActiveSubscription ? (
          <>
            <Button
              type="button"
              variant={confirmCancel ? "destructive" : "outline"}
              disabled={cancelLoading}
              onClick={cancelSubscription}
            >
              {cancelLoading
                ? "Cancelling…"
                : confirmCancel
                  ? "Confirm cancel"
                  : "Cancel subscription"}
            </Button>
            {confirmCancel && !cancelLoading ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmCancel(false)}>
                Keep plan
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
