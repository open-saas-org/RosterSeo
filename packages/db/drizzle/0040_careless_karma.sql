ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_estimated_monthly_traffic" integer;--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_organic_keywords" integer;--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_total_backlinks" integer;--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_referring_domains" integer;--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_domain_rating" integer;--> statement-breakpoint
ALTER TABLE "competitor_snapshot_cache" ADD COLUMN "previous_fetched_at" timestamp;