import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { organizationMembers, projects, withUserContext } from "@seo-tool/db";
import { eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getPostHogServerClient } from "@/lib/posthog-server";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/project-cookie";

// Static route (no [projectId] segment), so this talks to auth directly
// rather than through apps/web/lib/api-utils.ts's withAuth - that wrapper's
// generic is shaped for dynamic-segment routes.
async function requireSession(req: NextRequest) {
  return auth.api.getSession({ headers: req.headers });
}

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  const rows = await withUserContext(session.user.id, (tx) =>
    includeArchived ? tx.select().from(projects) : tx.select().from(projects).where(isNull(projects.archivedAt)),
  );
  return NextResponse.json({ projects: rows });
}

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(255),
  targetLocation: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await withUserContext(session.user.id, async (tx) => {
    // v1: one org per user (created at signup, see lib/auth.ts), so "my
    // org" is just the first membership row rather than a picker.
    const [membership] = await tx
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, session.user.id))
      .limit(1);

    if (!membership) {
      throw new Error("User has no organization - this should never happen post-signup");
    }

    const [created] = await tx
      .insert(projects)
      .values({ ...parsed.data, organizationId: membership.organizationId })
      .returning();
    return created;
  });

  getPostHogServerClient()?.capture({
    distinctId: session.user.id,
    event: "project_created",
    properties: { domain: project.domain },
  });

  // Newly created project becomes the active one immediately - same cookie
  // ProjectSwitcher's manual switch sets client-side (project-switcher.tsx),
  // just set server-side here so every creation path (onboarding, and any
  // future "add project" entry point) gets this for free without each one
  // having to remember to set it themselves.
  (await cookies()).set(ACTIVE_PROJECT_COOKIE, project.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ project }, { status: 201 });
}
