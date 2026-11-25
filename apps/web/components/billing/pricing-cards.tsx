"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { openCashfreeSubscriptionCheckout } from "@/lib/cashfree-client";
import { PLANS, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

const PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: "For your own website.",
  pro: "For freelancers and growing teams.",
  agency: "For agencies with many clients.",
};

function formatLimit(value: number): string {
  return value >= 999_999 ? "Unlimited" : value.toLocaleString();
}

function getPlanFeatures(plan: Plan): string[] {
  return [
    `${formatLimit(plan.limits.projects)} project${plan.limits.projects === 1 ? "" : "s"}`,
    `${formatLimit(plan.limits.maxTrackedKeywords)} tracked keywords`,
    `${formatLimit(plan.limits.page_analyzer_reports)} Page Analyzer reports / mo`,
    `${formatLimit(plan.limits.site_audits)} site audits / mo`,
    `${formatLimit(plan.limits.ai_visibility_prompts)} AI Visibility prompts / mo`,
    `${formatLimit(plan.limits.rank_checks)} rank checks / mo`,
    `${formatLimit(plan.limits.local_seo_scans)} Local SEO scans / mo`,
    `${formatLimit(plan.limits.connected_accounts)} connected Publish/Social accounts`,
  ];
}

export function PricingCards({
  currentPlanId,
  subscriptionStatus,
  hasActiveSubscription,
}: {
  currentPlanId: string;
  subscriptionStatus: string;
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
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        {purchasable.map((plan) => {
          const isCurrent = plan.id === currentPlanId && subscriptionStatus === "active";
          const isPopular = plan.id === "pro";

          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col",
                isPopular && "border-primary ring-1 ring-primary",
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name} Plan</CardTitle>
                  {isPopular ? <Badge>Popular</Badge> : null}
                </div>
                <CardDescription>{PLAN_DESCRIPTIONS[plan.id] ?? ""}</CardDescription>
                <div className="pt-3">
                  <span className="text-4xl font-bold tracking-tight text-foreground">${plan.priceUsd}</span>
                  <span className="text-sm text-muted-foreground"> /month</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  {getPlanFeatures(plan).map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5">
                      <Check className="size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-4">
                <Button
                  type="button"
                  className="w-full"
                  variant={isPopular && !isCurrent ? "default" : "outline"}
                  disabled={isCurrent || loadingPlanId !== null}
                  onClick={() => startCheckout(plan.id)}
                >
                  {isCurrent
                    ? "Current plan"
                    : loadingPlanId === plan.id
                      ? "Redirecting…"
                      : "Subscribe"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {hasActiveSubscription ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant={confirmCancel ? "destructive" : "ghost"}
            size="sm"
            disabled={cancelLoading}
            onClick={cancelSubscription}
          >
            {cancelLoading
              ? "Cancelling…"
              : confirmCancel
                ? "Confirm cancel subscription"
                : "Cancel current subscription"}
          </Button>
          {confirmCancel && !cancelLoading ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
              Keep plan
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
