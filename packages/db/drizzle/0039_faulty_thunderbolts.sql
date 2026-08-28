CREATE TABLE "competitor_snapshot_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"location_code" integer NOT NULL,
	"estimated_monthly_traffic" integer DEFAULT 0 NOT NULL,
	"organic_keywords" integer DEFAULT 0 NOT NULL,
	"top_pages" jsonb,
	"total_backlinks" integer DEFAULT 0 NOT NULL,
	"referring_domains" integer DEFAULT 0 NOT NULL,
	"domain_rating" integer DEFAULT 0 NOT NULL,
	"keyword_ideas" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_snapshot_cache_project_id_domain_location_code_unique" UNIQUE("project_id","domain","location_code")
);
--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD CONSTRAINT "competitor_snapshot_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE competitor_snapshot_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_snapshot_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON competitor_snapshot_cache
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );