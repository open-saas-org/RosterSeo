import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema, organizations, organizationMembers, withUserContext } from "@seo-tool/db";
import { getPostHogServerClient } from "@/lib/posthog-server";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: {
    window: 10,
    max: 100,
    // The blanket 100-req/10s window above covers every auth endpoint
    // uniformly, which in practice means no real limit on repeated login
    // attempts specifically - up to 100 password guesses against one
    // account in 10 seconds. Sign-in/sign-up get a much tighter window
    // (better-auth keys rate-limit state by IP+path, so this only throttles
    // repeated attempts, not a legitimate user's normal usage elsewhere).
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  databaseHooks: {
    user: {
      create: {
        // There's no "invite teammates to my org" flow yet (that's later
        // PRD 5.9 work) - every signup gets its own single-member
        // organization, so org == account for now. Runs inside
        // withUserContext(user.id, ...) because packages/db/drizzle/
        // 0004_org_signup_bootstrap_rls.sql's RLS policies require it:
        // the organization_members insert is only allowed when its
        // user_id matches the active session context, which for a brand
        // new signup is this user creating their own first row.
        after: async (user) => {
          const slug = `${user.email
            .split("@")[0]!
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}-${user.id.slice(0, 6)}`;

          // The org id is generated here rather than left to the DB's
          // defaultRandom() + .returning(), because RLS gates RETURNING
          // against the table's SELECT policy too - a brand new org has
          // no organization_members row yet, so it isn't SELECT-visible
          // to itself the instant it's inserted, and .returning() would
          // fail with "new row violates row-level security policy" even
          // though the INSERT itself is allowed. Knowing the id upfront
          // means we never need to read it back.
          const orgId = crypto.randomUUID();

          await withUserContext(user.id, async (tx) => {
            await tx.insert(organizations).values({
              id: orgId,
              name: `${user.name || user.email}'s Workspace`,
              slug,
            });
            await tx.insert(organizationMembers).values({
              organizationId: orgId,
              userId: user.id,
              role: "owner",
            });
          });

          getPostHogServerClient()?.capture({
            distinctId: user.id,
            event: "user_signed_up",
          });
        },
      },
    },
  },
});
