ALTER TABLE "ai_visibility_prompts" DROP CONSTRAINT "ai_visibility_prompts_parent_prompt_id_ai_visibility_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" DROP COLUMN "parent_prompt_id";