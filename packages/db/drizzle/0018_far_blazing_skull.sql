-- Superseded by the next migration (0019)'s keyword_metrics_cache +
-- keyword_research_searches, which replace "save a keyword you like" with
-- a real per-keyword metrics cache plus real search history - no backfill
-- needed since this table only ever held a raw list of saved keyword
-- strings with no metrics attached, nothing the new tables' richer shape
-- could be derived from.
DROP TABLE "saved_keywords" CASCADE;