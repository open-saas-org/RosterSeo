CREATE TABLE "keyword_metrics_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"search_volume" integer DEFAULT 0 NOT NULL,
	"keyword_difficulty" integer DEFAULT 0 NOT NULL,
	"cpc" double precision DEFAULT 0 NOT NULL,
	"intent" text,
	"monthly_searches" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_metrics_cache_project_id_keyword_location_code_unique" UNIQUE("project_id","keyword","location_code")
);
--> statement-breakpoint
CREATE TABLE "keyword_research_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"seed_keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"location_name" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_metrics_cache" ADD CONSTRAINT "keyword_metrics_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_research_searches" ADD CONSTRAINT "keyword_research_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE keyword_metrics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_metrics_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON keyword_metrics_cache
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE keyword_research_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_research_searches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON keyword_research_searches
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );