-- Apollo Restaurant OS — PostgreSQL Initialization
-- This script runs when the PostgreSQL container first starts.

-- 1. Enable extensions required for UUID generation and cryptographic security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create unprivileged application runtime role (NO SUPERUSER, NO BYPASSRLS)
-- This role is used by the backend application in production to ensure
-- database-level RLS policies cannot be bypassed even if compromised.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'apollo_app') THEN
    CREATE ROLE apollo_app WITH LOGIN PASSWORD 'change_me_in_production' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- Grant schema usage and standard DML rights
GRANT USAGE ON SCHEMA public TO apollo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apollo_app;

-- Confirmation
SELECT 'Apollo PostgreSQL initialized with extensions and unprivileged apollo_app role' AS status;
