import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { organizations, withSystemContext } from "@rosterseo/db";
import { auth } from "@/lib/auth";
import { getCashfreeSubscription } from "@/lib/cashfree";
import { getUserOrganization } from "@/lib/org";
import { getPlanByCashfreePlanId, isPaidPlanActive } from "@/lib/plans";
import { isSelfHosted } from "@/lib/self-hosted";
import { getUsageSummary } from "@/lib/usage";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { UsageMeter } from "@/components/billing/usage-meter";
import { BillingActions } from "@/components/billing/billing-actions";

const PAID_PLAN_IDS = new Set(["starter", "pro", "agency"]);

async function syncCashfreeSubscriptionIfActive(
  org: NonNullable<Awaited<ReturnType<typeof getUserOrganization>>>,
  subscriptionId: string,
  fallbackPlanId?: string,
) {
  try {
    // Verify the subscription_id belongs to this organization before
    // querying Cashfree or updating the DB, preventing cross-tenant replay.
    const expectedPrefix = `sub_${org.id.replace(/-/g, "").slice(0, 12)}_`;
    const belongsToOrg =
      org.stripeSubscriptionId === subscriptionId || subscriptionId.startsWith(expectedPrefix);
    if (!belongsToOrg) {
      return org;
    }

    const cfSub = await getCashfreeSubscription(subscriptionId);
    const status = cfSub.subscription_status?.toUpperCase();
    if (status !== "ACTIVE") {
      return org;
    }

    const cfPlanId = cfSub.plan_details?.plan_id;
    const planId =
      (cfPlanId ? getPlanByCashfreePlanId(cfPlanId)?.id : null) ??
      (fallbackPlanId && PAID_PLAN_IDS.has(fallbackPlanId) ? fallbackPlanId : null) ??
      org.planId;

    await withSystemContext((tx) =>
      tx
        .update(organizations)
        .set({
          stripeCustomerId: cfSub.customer_details?.customer_id ?? org.stripeCustomerId,
          stripeSubscriptionId: cfSub.subscription_id,
          planId,
          subscriptionStatus: "active",
        })
        .where(eq(organizations.id, org.id)),
    );

    return {
      ...org,
      stripeCustomerId: cfSub.customer_details?.customer_id ?? org.stripeCustomerId,
      stripeSubscriptionId: cfSub.subscription_id,
      planId,
      subscriptionStatus: "active",
    };
  } catch (err) {
    console.error("[billing] failed to verify Cashfree subscription", err);
    return org;
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; subscription_id?: string; plan_id?: string }>;
}) {
  if (isSelfHosted()) {
    redirect("/");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const initialOrg = await getUserOrganization(session.user.id);
  if (!initialOrg) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const org =
    params.checkout === "success" && params.subscription_id
      ? await syncCashfreeSubscriptionIfActive(initialOrg, params.subscription_id, params.plan_id)
      : initialOrg;

  const { plan, usage } = await getUsageSummary(org, session.user.id);
  const trialDaysLeft =
    org.subscriptionStatus === "trialing" && org.trialEndsAt
      ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title="Billing" description="Your plan, usage this month, and payment details." />
        <Link href="/pricing" className={buttonVariants({ variant: "outline", size: "sm" })}>
          View pricing plans
        </Link>
      </div>

      {params.checkout === "success" && isPaidPlanActive(org) ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Plan activated</CardTitle>
            <CardDescription>
              Your subscription is active on the <strong>{plan.name}</strong> plan.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Current plan: {plan.name}</CardTitle>
            <Badge variant={org.subscriptionStatus === "active" ? "default" : "secondary"}>{org.subscriptionStatus}</Badge>
          </div>
          <CardDescription>
            {trialDaysLeft !== null
              ? `Your trial includes Pro-level limits and ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}.`
              : "Choose a plan below, or manage an existing subscription."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingActions
            currentPlanId={org.planId}
            subscriptionStatus={org.subscriptionStatus}
            hasActiveSubscription={isPaidPlanActive(org) && Boolean(org.stripeSubscriptionId)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage this month</CardTitle>
          <CardDescription>Resets on the 1st of each month.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.map((row) => (
            <UsageMeter key={row.metric} metric={row.metric} used={row.used} limit={row.limit} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
