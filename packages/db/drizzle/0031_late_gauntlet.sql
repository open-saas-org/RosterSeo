CREATE TABLE "clay_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clay_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clay_project_notes" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"message_count_at_last_refresh" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "clay_provider" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "clay_model" text;--> statement-breakpoint
ALTER TABLE "clay_conversations" ADD CONSTRAINT "clay_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clay_conversations" ADD CONSTRAINT "clay_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clay_messages" ADD CONSTRAINT "clay_messages_conversation_id_clay_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."clay_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clay_messages" ADD CONSTRAINT "clay_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clay_project_notes" ADD CONSTRAINT "clay_project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE clay_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clay_conversations
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE clay_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clay_messages
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE clay_project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_project_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clay_project_notes
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );