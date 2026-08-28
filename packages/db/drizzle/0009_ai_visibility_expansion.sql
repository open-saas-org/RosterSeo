ALTER TABLE projects ADD COLUMN ai_visibility_context text;
--> statement-breakpoint
ALTER TABLE ai_visibility_prompts ADD COLUMN parent_prompt_id uuid;
--> statement-breakpoint
ALTER TABLE ai_visibility_prompts ADD CONSTRAINT ai_visibility_prompts_parent_prompt_id_ai_visibility_prompts_id_fk
  FOREIGN KEY (parent_prompt_id) REFERENCES ai_visibility_prompts(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ai_visibility_results ADD COLUMN run_id uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE ai_visibility_results ALTER COLUMN run_id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE ai_visibility_results ADD COLUMN entity_domain text;
--> statement-breakpoint
ALTER TABLE ai_visibility_results ADD COLUMN citations jsonb;
