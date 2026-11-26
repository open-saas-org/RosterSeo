import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft, CreditCard } from "lucide-react";
import { auth } from "@/lib/auth";
import { getUserOrganization } from "@/lib/org";
import { isPaidPlanActive } from "@/lib/plans";
import { isSelfHosted } from "@/lib/self-hosted";
import { PricingCards } from "@/components/billing/pricing-cards";

export default async function PricingPage() {
  if (isSelfHosted()) {
    redirect("/");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const org = await getUserOrganization(session.user.id);
  if (!org) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to app
        </Link>
        <Link
          href="/settings/billing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          title="Billing & usage"
        >
          <CreditCard className="size-4" />
          Billing
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Upgrade your plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            SEO on your terms. All your SEO tools in one place at a fair price.
          </p>
        </div>

        <div className="mt-10 w-full max-w-5xl">
          <PricingCards
            currentPlanId={org.planId}
            subscriptionStatus={org.subscriptionStatus}
            hasActiveSubscription={isPaidPlanActive(org) && Boolean(org.stripeSubscriptionId)}
          />
        </div>
      </main>
    </div>
  );
}
