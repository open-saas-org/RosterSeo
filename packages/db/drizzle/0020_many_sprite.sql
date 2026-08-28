CREATE TABLE "ai_visibility_opportunity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report" jsonb NOT NULL,
	"provider" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_results" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "ai_visibility_results" ADD COLUMN "web_queries" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_visibility_targets" jsonb;--> statement-breakpoint
ALTER TABLE "ai_visibility_opportunity_reports" ADD CONSTRAINT "ai_visibility_opportunity_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE ai_visibility_opportunity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_opportunity_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_visibility_opportunity_reports
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );