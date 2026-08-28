import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SpendWorkspace } from "@/components/spend/spend-workspace";
import { auth } from "@/lib/auth";
import { getSpendSummary } from "@/lib/spend-data";

// Same global/account-level pattern as the Settings page (auth.api.getSession
// directly, no getCurrentProject()) - spend is instance-wide, not
// project-scoped, since every provider credential it tracks is a single
// global env var for the whole deployment (see providerSpendLog's own
// comment in packages/db/src/app-schema.ts).
export default async function SpendPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const summary = await getSpendSummary();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Spend"
        description="Real (or clearly-flagged-estimated) cost across every external API this deployment pays for - DataForSEO, BrightData, and the AI Visibility LLM providers."
      />
      <SpendWorkspace initialSummary={summary} />
    </div>
  );
}
