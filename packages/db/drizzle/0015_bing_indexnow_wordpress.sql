-- Bing Webmaster Tools + IndexNow + WordPress integrations.
ALTER TABLE "projects" ADD COLUMN "bing_site_url" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "indexnow_key" text;
--> statement-breakpoint
CREATE TABLE "wordpress_connections" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"site_url" text NOT NULL,
	"username" text NOT NULL,
	"application_password" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wordpress_connections" ADD CONSTRAINT "wordpress_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE wordpress_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE wordpress_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wordpress_connections
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );
