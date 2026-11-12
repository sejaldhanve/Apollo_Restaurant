-- CreateExtension (wrapped in exception block for universal host compatibility)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- CreateTable: organizations
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: locations
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organizationId_code_key" ON "locations"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
-- PostgreSQL Row-Level Security (RLS) Configuration
-- =========================================================================

-- 1. Enable and Force Row-Level Security on tenant-owned tables.
-- FORCE ROW LEVEL SECURITY guarantees that even table owners / db superusers
-- (defense-in-depth) are subject to tenant isolation policies.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;

-- 2. Tenant Isolation Policies
-- Evaluates current_setting('app.current_tenant_id', true).
-- If tenant context is missing/empty, NULLIF evaluates to NULL and the predicate fails,
-- denying all access.
CREATE POLICY "org_tenant_isolation_policy" ON "organizations"
    FOR ALL
    USING ("id" = NULLIF(current_setting('app.current_tenant_id', true), ''))
    WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant_id', true), ''));

CREATE POLICY "location_tenant_isolation_policy" ON "locations"
    FOR ALL
    USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));
