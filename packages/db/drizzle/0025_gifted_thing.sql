CREATE TABLE "mcp_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "mcp_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
-- Deliberately NOT RLS-protected, same reasoning 0001_rls_policies.sql
-- gives for excluding user/session/account/verification: the MCP server
-- has to look up which user a key belongs to BEFORE any request context
-- exists, so app.current_user_id can't be set yet for that query - a
-- forced RLS policy here would make every key lookup return zero rows,
-- including for the real key holder. The `key_hash` equality match IS the
-- real access control (a 192-bit random secret, not enumerable); every
-- app-side query against this table filters by user_id explicitly in
-- application code instead of relying on RLS.