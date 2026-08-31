import { redirect } from "next/navigation";
import { db, user } from "@rosterseo/db";
import { LoginForm } from "@/components/login-form";

// Without this, Next tries to statically prerender /login at `docker build`
// time (no page-level data fetching used to make that unsafe) - there's no
// Postgres reachable during the image build, so the query below fails the
// whole build with ECONNREFUSED. This page's answer depends on live DB
// state and can never be meaningfully precomputed, so force real per-request
// rendering instead of prerendering.
export const dynamic = "force-dynamic";

// A brand-new self-hosted instance has an empty `user` table - nobody to
// log in as yet. Sending a first-run visitor to /login (a form for an
// account that can't exist) is a dead end; redirect straight to /signup
// instead, same as any other "nothing here yet" empty state elsewhere in
// the app. One indexed existence check, only paid on this page (not on
// every request the way a middleware-level check would be) - the `user`
// table has no RLS (better-auth's own identity table, not tenant data),
// so this plain query is intentional, not a missed withUserContext.
export default async function LoginPage() {
  const [anyUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!anyUser) {
    redirect("/signup");
  }

  return <LoginForm />;
}
