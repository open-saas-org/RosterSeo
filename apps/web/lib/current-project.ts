import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNull } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { auth } from "@/lib/auth";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/project-cookie";

// Resolves "the project this page should act on" - session + project list
// fetched the same way apps/web/app/(dashboard)/layout.tsx already does
// (redirect /login, redirect /onboarding on zero projects), plus reading
// which one the user last picked in ProjectSwitcher. Falls back to the
// first project if the cookie is missing, stale, or points at a project
// this user doesn't have access to.
export async function getCurrentProject() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Archived projects are never "the active project" - they only show up
  // in the switcher's restore list.
  const projectRows = await withUserContext(session.user.id, (tx) => tx.select().from(projects).where(isNull(projects.archivedAt)));
  if (projectRows.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  const project = projectRows.find((p) => p.id === activeId) ?? projectRows[0]!;

  return { session, project, projects: projectRows };
}
