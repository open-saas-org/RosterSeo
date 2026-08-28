-- Per-project Merchant Center account selection (Merchant API migration -
-- Content API for Shopping is being sunset by Google, real accounts.list
-- confirmed live against the new merchantapi.googleapis.com endpoint).
ALTER TABLE "projects" ADD COLUMN "merchant_account_id" text;
