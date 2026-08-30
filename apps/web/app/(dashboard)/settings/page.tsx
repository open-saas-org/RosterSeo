import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Settings } from "lucide-react";
import { organizationMembers, organizations, withUserContext } from "@rosterseo/db";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/settings/sign-out-button";

// Same session-fetch pattern as apps/web/app/(dashboard)/layout.tsx
// (auth.api.getSession against forwarded headers). The layout already
// redirects unauthenticated requests before this page renders, but this
// stays defensive rather than assuming that always stays true.
export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // Same membership -> organization join shape as lib/auth.ts's signup
  // hook and app/api/projects/route.ts's "my org" lookup: v1 is one
  // organization per user, so the first membership row is "the" org.
  const [membership] = await withUserContext(session.user.id, (tx) =>
    tx
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, session.user.id))
      .limit(1),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Your account and organization details." />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Read-only for now — there is no edit-profile flow yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm">{session.user.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="text-sm">{session.user.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            {membership
              ? "Every account gets its own single-member organization at signup — there is no invite-teammates flow yet."
              : "No organization membership found for this account."}
          </CardDescription>
        </CardHeader>
        {membership ? (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="text-sm">{membership.organizationName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Slug</p>
              <p className="text-sm">{membership.organizationSlug}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Role</p>
              <Badge variant="secondary" className="mt-0.5">
                {membership.role}
              </Badge>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Sign out of your account on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
