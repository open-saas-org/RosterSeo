CREATE TABLE "social_post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"social_post_target_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"reach" integer,
	"impressions" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"clicks" integer
);
--> statement-breakpoint
ALTER TABLE "social_post_metrics" ADD CONSTRAINT "social_post_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_metrics" ADD CONSTRAINT "social_post_metrics_social_post_target_id_social_post_targets_id_fk" FOREIGN KEY ("social_post_target_id") REFERENCES "public"."social_post_targets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE social_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_metrics FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON social_post_metrics
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
