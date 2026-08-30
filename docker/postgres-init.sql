-- Runs once on first container start (mounted into
-- /docker-entrypoint-initdb.d/). Creates the restricted role the running
-- app connects as - see packages/db/README.md for why this has to be a
-- separate, non-superuser role for RLS to mean anything.
CREATE ROLE rosterseo_app WITH LOGIN PASSWORD 'rosterseo_dev' NOSUPERUSER NOBYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rosterseo_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rosterseo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO rosterseo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO rosterseo_app;
-- pg-boss provisions its own `pgboss` schema on first start (apps/worker),
-- which needs CREATE on the database. This doesn't weaken RLS - CREATE
-- lets the role make new objects, not read rows through existing policies.
GRANT CREATE ON DATABASE rosterseo TO rosterseo_app;
