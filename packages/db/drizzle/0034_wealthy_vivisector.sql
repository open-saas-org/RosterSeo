CREATE TABLE "site_audit_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_audit_links" ADD CONSTRAINT "site_audit_links_audit_id_site_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."site_audits"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "site_audit_links_audit_target_idx" ON "site_audit_links" ("audit_id", "target_url");
--> statement-breakpoint
ALTER TABLE site_audit_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_audit_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_audit_links
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