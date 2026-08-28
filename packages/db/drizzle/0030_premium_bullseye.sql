CREATE TABLE "email_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_username" text,
	"smtp_password_encrypted" text,
	"gmail_access_token" text,
	"gmail_refresh_token" text,
	"gmail_expires_at" timestamp,
	"gmail_needs_reconnect" boolean DEFAULT false NOT NULL,
	"daily_send_limit" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"source_url_from" text,
	"contact_email" text,
	"contact_email_source" text,
	"subject" text,
	"body" text,
	"status" text DEFAULT 'new' NOT NULL,
	"email_connection_id" uuid,
	"failure_reason" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlinks_cache" ADD COLUMN "top_backlinks" jsonb;--> statement-breakpoint
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_targets" ADD CONSTRAINT "outreach_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_targets" ADD CONSTRAINT "outreach_targets_email_connection_id_email_connections_id_fk" FOREIGN KEY ("email_connection_id") REFERENCES "public"."email_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_connections
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
--> statement-breakpoint
ALTER TABLE outreach_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_targets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outreach_targets
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );