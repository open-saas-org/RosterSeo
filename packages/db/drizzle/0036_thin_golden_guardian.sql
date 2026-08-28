ALTER TABLE "ai_visibility_results" ADD COLUMN "raw_output" jsonb;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD COLUMN "aliases" jsonb;--> statement-breakpoint
ALTER TABLE "project_competitors" ADD COLUMN "additional_domains" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_visibility_aliases" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_visibility_additional_domains" jsonb;