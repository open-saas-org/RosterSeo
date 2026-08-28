CREATE TABLE "rank_check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"keywords_total" integer NOT NULL,
	"keywords_checked" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rank_tracking_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"location_code" integer NOT NULL,
	"location_name" text NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"schedule_interval" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_business_profiles" ALTER COLUMN "grid_size" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "local_business_profiles" ALTER COLUMN "radius_km" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "local_business_profiles" ALTER COLUMN "auto_track_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD COLUMN "serp_features" jsonb;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD COLUMN "search_volume" integer;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD COLUMN "keyword_difficulty" integer;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD COLUMN "cpc" double precision;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD COLUMN "metrics_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tracking_settings" ADD CONSTRAINT "rank_tracking_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD CONSTRAINT "keyword_rankings_run_id_rank_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_check_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE rank_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rank_check_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rank_check_runs
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE rank_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rank_tracking_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rank_tracking_settings
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );