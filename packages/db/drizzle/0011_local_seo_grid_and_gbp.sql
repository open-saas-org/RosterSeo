ALTER TABLE projects ADD COLUMN gbp_account_id text;
ALTER TABLE projects ADD COLUMN gbp_location_id text;
ALTER TABLE projects ADD COLUMN gbp_location_name text;
ALTER TABLE projects ADD COLUMN gbp_lat double precision;
ALTER TABLE projects ADD COLUMN gbp_lng double precision;
--> statement-breakpoint
CREATE TABLE "local_grid_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"radius_km" double precision NOT NULL,
	"grid_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_grid_scan_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"position" integer,
	"business_name" text
);
--> statement-breakpoint
ALTER TABLE "local_grid_scans" ADD CONSTRAINT "local_grid_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "local_grid_scan_points" ADD CONSTRAINT "local_grid_scan_points_scan_id_local_grid_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."local_grid_scans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE local_grid_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_grid_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_grid_scans
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE local_grid_scan_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_grid_scan_points FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_grid_scan_points
  USING (
    scan_id IN (
      SELECT id FROM local_grid_scans WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)
        )
      )
    )
  );
