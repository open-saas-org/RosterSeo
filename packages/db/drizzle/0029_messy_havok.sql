CREATE TABLE "provider_spend_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"cost_usd" double precision NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
-- Deliberately NOT RLS-protected, same reasoning as mcp_api_keys
-- (0025_gifted_thing.sql): there's no project_id/organization_id to scope
-- by - every provider credential this table tracks spend for is a single
-- global env var for the whole deployment, not per-org. The Spend page's
-- route gates on a real signed-in session (withAuth) instead.
