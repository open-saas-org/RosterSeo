import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { isSelfHosted } from "@/lib/self-hosted";
import { getUsageSummary } from "@/lib/usage";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UsageMeter } from "@/components/billing/usage-meter";
import { BillingActions } from "@/components/billing/billing-actions";

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  if (isSelfHosted()) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Billing" description="Plans, usage, and payment details." />
        <Card>
          <CardHeader>
            <CardTitle>Not applicable on a self-hosted install</CardTitle>
            <CardDescription>
              This deployment is running in self-hosted mode (<code>SELF_HOSTED=true</code>, the default) - there&apos;s no
              subscription or usage cap here. You bring your own DataForSEO/LLM/Google credentials and every feature
              is fully available. Billing only applies to the hosted SaaS version of RosterSEO.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    redirect("/onboarding");
  }

  const { plan, usage } = await getUsageSummary(org, session.user.id);
  const trialDaysLeft =
    org.subscriptionStatus === "trialing" && org.trialEndsAt
      ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Billing" description="Your plan, usage this month, and payment details." />

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
          <BillingActions currentPlanId={org.planId} hasStripeCustomer={Boolean(org.stripeCustomerId)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage this month</CardTitle>
          <CardDescription>Resets on the 1st of each month. Self-hosted installs never see this - see above.</CardDescription>
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
