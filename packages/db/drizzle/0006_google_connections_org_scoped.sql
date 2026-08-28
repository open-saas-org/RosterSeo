-- Moves the Google OAuth connection from project-scoped to
-- organization-scoped: a Google account grant belongs to the account, not
-- a single project, so it's authenticated once per organization and every
-- project underneath picks a property from that same connection. There is
-- no real production data to preserve at this stage (this feature was
-- built and never shipped within the same session as this migration), so
-- this truncates rather than attempting a backfill.

DROP POLICY tenant_isolation ON google_connections;

TRUNCATE google_connections;

ALTER TABLE google_connections
  DROP COLUMN project_id,
  DROP COLUMN property_id;
--> statement-breakpoint

ALTER TABLE google_connections
  ADD COLUMN organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE google_connections
  ADD CONSTRAINT google_connections_organization_id_service_unique UNIQUE (organization_id, service);
--> statement-breakpoint

CREATE POLICY tenant_isolation ON google_connections
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = current_setting('app.current_user_id', true)
    )
  );
--> statement-breakpoint

ALTER TABLE projects
  ADD COLUMN gsc_property_id text,
  ADD COLUMN ga4_property_id text;
