ALTER TABLE site_audit_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_audit_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_audit_pages
  USING (
    audit_id IN (
      SELECT id FROM site_audits WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)
        )
      )
    )
  );
--> statement-breakpoint
ALTER TABLE site_audits ADD COLUMN pages_discovered integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE site_audits ADD COLUMN max_pages integer DEFAULT 200 NOT NULL;
--> statement-breakpoint
ALTER TABLE site_audit_pages ADD COLUMN redirected_to text;
