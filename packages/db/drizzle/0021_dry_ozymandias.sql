ALTER TABLE "ai_visibility_prompts" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;