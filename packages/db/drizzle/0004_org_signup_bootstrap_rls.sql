-- Additive only - does not touch the `tenant_isolation` policies from
-- 0001/0003. RLS policies are permissive and OR together per command, so
-- adding a new policy here only ever widens what's allowed for the
-- specific command it targets; it can't narrow or override the existing
-- SELECT/UPDATE/DELETE checks.
--
-- Why this is needed: creating a brand-new organization, and the first
-- organization_members row that grants its creator access to it, can't
-- satisfy "is the current user already a member of this org" - neither
-- row exists yet. This is the signup flow in
-- apps/web/lib/auth.ts (databaseHooks.user.create.after).
--
-- organizations: INSERT is allowed unconditionally. This is safe because
-- the sensitive operation is reading/modifying an org's data, which the
-- existing tenant_isolation policy still fully governs (this new policy
-- only applies to INSERT, not SELECT/UPDATE/DELETE) - creating a new,
-- empty org row has nothing to leak.
CREATE POLICY allow_insert ON organizations
  FOR INSERT WITH CHECK (true);

-- organization_members: INSERT is NOT unconditional, because this table
-- is the actual access grant - unlike organizations, letting anyone
-- insert an arbitrary row here would let a buggy or compromised app-layer
-- code path grant one user access to another user's org. The check
-- allows a row only when its user_id matches the currently-authenticated
-- user (via withUserContext), so a user can only ever grant an
-- organization_members row to themselves, never to someone else.
CREATE POLICY allow_self_insert ON organization_members
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));
