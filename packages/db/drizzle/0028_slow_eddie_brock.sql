CREATE TABLE "backlinks_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"total_backlinks" integer DEFAULT 0 NOT NULL,
	"referring_domains" integer DEFAULT 0 NOT NULL,
	"domain_rating" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "backlinks_cache_project_id_domain_unique" UNIQUE("project_id","domain")
);
--> statement-breakpoint
ALTER TABLE "backlinks_cache" ADD CONSTRAINT "backlinks_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE backlinks_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON backlinks_cache
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );