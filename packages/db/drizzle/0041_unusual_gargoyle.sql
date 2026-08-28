CREATE TABLE "ai_visibility_report_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_visibility_report_shares_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "ai_visibility_report_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_report_shares" ADD CONSTRAINT "ai_visibility_report_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_report_shares" ADD CONSTRAINT "ai_visibility_report_shares_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;