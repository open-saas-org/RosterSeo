-- Runs once on first container start (mounted into
-- /docker-entrypoint-initdb.d/). Creates the restricted role the running
-- app connects as - see packages/db/README.md for why this has to be a
-- separate, non-superuser role for RLS to mean anything.
CREATE ROLE seo_tool_app WITH LOGIN PASSWORD 'seo_tool_dev' NOSUPERUSER NOBYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO seo_tool_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO seo_tool_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO seo_tool_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO seo_tool_app;
-- pg-boss provisions its own `pgboss` schema on first start (apps/worker),
-- which needs CREATE on the database. This doesn't weaken RLS - CREATE
-- lets the role make new objects, not read rows through existing policies.
GRANT CREATE ON DATABASE seo_tool TO seo_tool_app;
