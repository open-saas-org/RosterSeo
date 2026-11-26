import { eq } from "drizzle-orm";
import { organizationMembers, organizations, withUserContext } from "@rosterseo/db";

// v1: one org per user (created at signup, see lib/auth.ts), so "my org"
// is the first membership row - same shape as app/api/projects/route.ts's
// and app/(dashboard)/settings/page.tsx's own inline lookups, pulled out
// here since the new billing routes need the full organizations row (not
// just the id) to read/write stripeCustomerId/planId/etc.
export async function getUserOrganization(userId: string) {
  const [org] = await withUserContext(userId, (tx) =>
    tx
      .select({ organization: organizations })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId))
      .limit(1),
  );
  return org?.organization ?? null;
}
