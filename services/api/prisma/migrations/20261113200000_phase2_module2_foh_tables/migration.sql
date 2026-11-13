-- Phase 2 — Module 2: FoH Floor Plan & Table Management (additive migration)
-- Adds TableShape, TableStatus, SessionStatus enums, dining_areas, tables, table_sessions tables, and strict RLS policies.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CREATE ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────

CREATE TYPE "TableShape" AS ENUM ('RECTANGLE', 'ROUND', 'SQUARE', 'BOOTH', 'BAR_STOOL');
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'SEATED', 'ORDERED', 'SERVED', 'PAYMENT_PENDING', 'DIRTY', 'RESERVED', 'BLOCKED');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CREATE FOH TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- dining_areas
CREATE TABLE "dining_areas" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId"     TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dining_areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dining_areas_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dining_areas_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "dining_areas_locationId_name_key" ON "dining_areas"("locationId", "name");
CREATE INDEX "dining_areas_organizationId_idx" ON "dining_areas"("organizationId");

-- tables
CREATE TABLE "tables" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId"     TEXT NOT NULL,
  "diningAreaId"   TEXT NOT NULL,
  "tableNumber"    TEXT NOT NULL,
  "shape"          "TableShape" NOT NULL DEFAULT 'RECTANGLE',
  "minCovers"      INTEGER NOT NULL DEFAULT 1,
  "maxCovers"      INTEGER NOT NULL DEFAULT 4,
  "posX"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "posY"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "width"          DOUBLE PRECISION NOT NULL DEFAULT 100,
  "height"         DOUBLE PRECISION NOT NULL DEFAULT 100,
  "rotation"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"         "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tables_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tables_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tables_diningAreaId_fkey"
    FOREIGN KEY ("diningAreaId") REFERENCES "dining_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tables_locationId_tableNumber_key" ON "tables"("locationId", "tableNumber");
CREATE INDEX "tables_organizationId_idx" ON "tables"("organizationId");
CREATE INDEX "tables_locationId_status_idx" ON "tables"("locationId", "status");

-- table_sessions
CREATE TABLE "table_sessions" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId"     TEXT NOT NULL,
  "tableId"        TEXT NOT NULL,
  "serverUserId"   TEXT,
  "guestCount"     INTEGER NOT NULL DEFAULT 2,
  "seatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"       TIMESTAMP(3),
  "status"         "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "table_sessions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "table_sessions_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "table_sessions_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "table_sessions_serverUserId_fkey"
    FOREIGN KEY ("serverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "table_sessions_organizationId_idx" ON "table_sessions"("organizationId");
CREATE INDEX "table_sessions_locationId_status_idx" ON "table_sessions"("locationId", "status");

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS) TENANT ISOLATION POLICIES
-- ────────────────────────────────────────────────────────────────────────────

-- dining_areas
ALTER TABLE "dining_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dining_areas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dining_areas_tenant_isolation_policy" ON "dining_areas"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- tables
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tables_tenant_isolation_policy" ON "tables"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- table_sessions
ALTER TABLE "table_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "table_sessions_tenant_isolation_policy" ON "table_sessions"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

