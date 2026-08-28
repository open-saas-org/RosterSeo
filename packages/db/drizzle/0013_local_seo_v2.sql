-- Local SEO v2: drop the Google Business Profile OAuth columns and the
-- old flat one-off rank checker, replace with a DataForSEO-backed
-- local_business_profiles table (profile + Monitor config) and a
-- local_seo_recommendations checklist (Optimize).
ALTER TABLE projects DROP COLUMN gbp_account_id;
ALTER TABLE projects DROP COLUMN gbp_location_id;
ALTER TABLE projects DROP COLUMN gbp_location_name;
ALTER TABLE projects DROP COLUMN gbp_lat;
ALTER TABLE projects DROP COLUMN gbp_lng;
--> statement-breakpoint
DROP TABLE "local_rank_checks";
--> statement-breakpoint
CREATE TABLE "local_business_profiles" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"place_id" text,
	"cid" text,
	"search_query" text,
	"location_code" integer,
	"address" text,
	"phone" text,
	"website" text,
	"domain" text,
	"category" text,
	"additional_categories" jsonb,
	"description" text,
	"rating" double precision,
	"review_count" integer,
	"total_photos" integer,
	"is_claimed" boolean,
	"work_time" jsonb,
	"attributes" jsonb,
	"last_synced_at" timestamp,
	"tracked_keyword" text,
	"grid_size" integer DEFAULT 5 NOT NULL,
	"radius_km" double precision DEFAULT 5 NOT NULL,
	"auto_track_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_seo_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_business_profiles" ADD CONSTRAINT "local_business_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_seo_recommendations" ADD CONSTRAINT "local_seo_recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE local_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_business_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_business_profiles
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE local_seo_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_seo_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_seo_recommendations
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
