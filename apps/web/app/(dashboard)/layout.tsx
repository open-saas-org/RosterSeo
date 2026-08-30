import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNotNull, isNull } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { auth } from "@/lib/auth";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/project-cookie";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSpendSummary } from "@/lib/spend-data";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  // Belt-and-suspenders with middleware.ts's cookie-presence check - that
  // one is fast but doesn't validate the session, this one does.
  if (!session) {
    redirect("/login");
  }

  const [projectRows, archivedRows] = await withUserContext(session.user.id, async (tx) => [
    await tx.select().from(projects).where(isNull(projects.archivedAt)),
    await tx.select().from(projects).where(isNotNull(projects.archivedAt)),
  ]);

  // PRD Section 4, step 1: sign up -> create first project. A user with
  // zero ACTIVE projects has nothing for any dashboard page to show yet -
  // even if they have archived ones, restoring those happens from inside
  // the dashboard (the switcher), so this still needs at least one active
  // project to land on.
  if (projectRows.length === 0) {
    redirect("/onboarding");
  }

  // Same cookie + fallback logic as lib/current-project.ts, resolved inline
  // here (rather than a second DB round-trip) since projectRows is already
  // fetched above - AppSidebar needs it to know which project's Clay
  // threads to list when it's in Chat mode.
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  const activeProject = projectRows.find((p) => p.id === activeProjectId) ?? projectRows[0]!;

  // Real, instance-wide total (not project-scoped - see providerSpendLog's
  // own schema comment) - fetched fresh on every dashboard navigation, same
  // as projectRows/archivedRows above, so the nav bar's number is never
  // more than one page load stale.
  const { totalAllTimeUsd } = await getSpendSummary();

  return (
    <SidebarProvider>
      <AppSidebar
        user={{ name: session.user.name, email: session.user.email }}
        projects={projectRows.map((p) => ({ id: p.id, name: p.name, domain: p.domain }))}
        archivedProjects={archivedRows.map((p) => ({ id: p.id, name: p.name, domain: p.domain }))}
        activeProjectId={activeProject.id}
      />
      <SidebarInset>
        <SiteHeader totalSpendUsd={totalAllTimeUsd} />
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
