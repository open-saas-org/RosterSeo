-- Tenant isolation, enforced at the database layer (PRD Section 6), as a
-- backstop for anything an app-level check in a Route Handler misses.
--
-- Model: every query that touches tenant data runs inside a transaction
-- that first does `SELECT set_config('app.current_user_id', '<id>', true)`.
-- Policies below compute visibility from that user's memberships - NOT from
-- a pre-declared org id, because a request that only knows a project id
-- (e.g. /api/projects/:id/...) can't know that project's org up front
-- without reading it, and it can't read it without RLS already allowing it.
-- Scoping by user_id sidesteps that bootstrapping problem entirely: with
-- only current_user_id set, "which orgs / projects can this user see" is
-- answerable directly via a membership subquery.
--
-- If the app forgets to set app.current_user_id, current_setting(...) is
-- NULL, every policy evaluates to false, and queries return zero rows -
-- fails closed, never leaks.
--
-- FORCE ROW LEVEL SECURITY matters here because in a self-hosted deploy the
-- app's DB role is typically also the table owner, and RLS is skipped for
-- owners by default. Forcing it means the same policies apply regardless
-- of which role is connecting.
--
-- Identity tables (user, session, account, verification) are intentionally
-- excluded: they're not organization-scoped, and auth needs to look up a
-- user before any request context exists.
--
-- Known limitation: organization_members' own policy (below) only lets a
-- user see their OWN membership row, not their teammates'. A future "team
-- members" list feature will need a SECURITY DEFINER helper function to
-- read other members' rows without hitting the self-referential recursion
-- explained below - don't try to widen this policy directly.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- Deliberately NOT "which orgs am I a member of, via organization_members" -
-- a policy on this table can't subquery this same table without Postgres
-- re-applying the policy to that subquery too, which re-triggers the same
-- subquery, infinitely. Scoping directly by user_id sidesteps that; other
-- tables' policies subquery this table safely since their subquery doesn't
-- reference organization_members from within organization_members' own
-- policy.
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization_members
  USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

ALTER TABLE project_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_competitors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_competitors
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE tracked_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_keywords FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tracked_keywords
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_ledger
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );
