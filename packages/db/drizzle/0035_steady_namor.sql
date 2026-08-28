ALTER TABLE "site_audits" ADD COLUMN "crawl_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_audits" ADD COLUMN "link_graph_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_audits" ADD COLUMN "deep_check_status" text;--> statement-breakpoint
ALTER TABLE "site_audits" ADD COLUMN "deep_check_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "site_audits" ADD COLUMN "deep_check_completed_at" timestamp;