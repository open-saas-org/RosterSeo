ALTER TABLE "site_audit_pages" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "site_audit_pages" ADD COLUMN "meta_robots" text;--> statement-breakpoint
ALTER TABLE "site_audit_pages" ADD COLUMN "crawl_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_audit_pages" ADD COLUMN "action" text DEFAULT 'no_action' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_audit_pages" ADD COLUMN "notes" text;