-- Apollo Restaurant OS — PostgreSQL Initialization
-- This script runs when the PostgreSQL container first starts.

-- Enable extensions required for UUID generation and cryptographic security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Initial confirmation
SELECT 'Apollo PostgreSQL initialized with extensions uuid-ossp, pgcrypto' AS status;

