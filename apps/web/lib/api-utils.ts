import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { projects, withUserContext } from "@seo-tool/db";
import { auth } from "@/lib/auth";

export type AuthedSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

// Every Route Handler that touches tenant data should go through this rather
// than calling auth.api.getSession itself, so "no session -> 401" can't be
// forgotten on a new route. Postgres RLS (packages/db/drizzle) is the
// backstop for the same reason, on the DB side.
export function withAuth<Params extends Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: Promise<Params> }, session: AuthedSession) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx, session);
  };
}

// Resolves a project only if the session's user belongs to the organization
// that owns it. Returns null on either "doesn't exist" or "not yours" -
// deliberately not distinguishing the two, so this can't be used to probe
// for other tenants' project IDs. Runs inside withUserContext so RLS (not
// just this app-level join) is the thing actually enforcing that - this
// query would return the row even without the RLS policy in place, since
// it's not scoped by user itself, so the transaction context is load-bearing
// here, not decorative.
export async function requireProjectAccess(projectId: string, userId: string) {
  return withUserContext(userId, async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return project ?? null;
  });
}
