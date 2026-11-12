-- Phase 1: Domain & Auth Models (additive migration)
-- Adds enums, new columns on existing tables, and all new auth/RBAC tables.
-- Applies RLS to tenant-scoped tables only.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CREATE ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────

CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING_VERIFICATION');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');
CREATE TYPE "RoleScope" AS ENUM ('ORGANIZATION', 'LOCATION');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ALTER EXISTING TABLES
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "organizations"
  ADD COLUMN "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "locations"
  ADD COLUMN "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "address" TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CREATE NEW TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- users (global, no RLS)
CREATE TABLE "users" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "email"         TEXT NOT NULL,
  "passwordHash"  TEXT NOT NULL,
  "firstName"     TEXT NOT NULL,
  "lastName"      TEXT NOT NULL,
  "status"        "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- roles (tenant-scoped)
CREATE TABLE "roles" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "isSystem"       BOOLEAN NOT NULL DEFAULT false,
  "scope"          "RoleScope" NOT NULL DEFAULT 'ORGANIZATION',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "roles_organizationId_name_key" ON "roles"("organizationId", "name");
CREATE INDEX "roles_organizationId_idx" ON "roles"("organizationId");

-- permissions (global, no RLS)
CREATE TABLE "permissions" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "module"      TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- role_permissions (tenant-scoped, denormalized orgId)
CREATE TABLE "role_permissions" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "roleId"         TEXT NOT NULL,
  "permissionId"   TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");
CREATE INDEX "role_permissions_organizationId_idx" ON "role_permissions"("organizationId");

-- organization_memberships (tenant-scoped)
CREATE TABLE "organization_memberships" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "roleId"         TEXT NOT NULL,
  "status"         "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "invitedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt"       TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_memberships_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key" ON "organization_memberships"("userId", "organizationId");
CREATE INDEX "organization_memberships_organizationId_idx" ON "organization_memberships"("organizationId");

-- location_memberships (tenant-scoped, denormalized orgId)
CREATE TABLE "location_memberships" (
  "id"                       TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationMembershipId" TEXT NOT NULL,
  "locationId"               TEXT NOT NULL,
  "organizationId"           TEXT NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,

  CONSTRAINT "location_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_memberships_organizationMembershipId_fkey"
    FOREIGN KEY ("organizationMembershipId") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "location_memberships_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "location_memberships_organizationMembershipId_locationId_key" ON "location_memberships"("organizationMembershipId", "locationId");
CREATE INDEX "location_memberships_organizationId_idx" ON "location_memberships"("organizationId");

-- refresh_tokens (NOT tenant-scoped)
CREATE TABLE "refresh_tokens" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
  "userId"            TEXT NOT NULL,
  "tokenHash"         TEXT NOT NULL,
  "family"            TEXT NOT NULL,
  "expiresAt"         TIMESTAMP(3) NOT NULL,
  "revokedAt"         TIMESTAMP(3),
  "replacedByTokenId" TEXT,
  "userAgent"         TEXT,
  "ipAddress"         TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- audit_logs (tenant-scoped, orgId nullable)
CREATE TABLE "audit_logs" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT,
  "actorId"        TEXT,
  "action"         TEXT NOT NULL,
  "entityType"     TEXT,
  "entityId"       TEXT,
  "metadata"       JSONB,
  "ipAddress"      TEXT,
  "requestId"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — tenant-scoped tables only
-- ────────────────────────────────────────────────────────────────────────────

-- organization_memberships
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_membership_tenant_isolation_policy" ON "organization_memberships"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- location_memberships
ALTER TABLE "location_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "location_membership_tenant_isolation_policy" ON "location_memberships"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- roles
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_tenant_isolation_policy" ON "roles"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- role_permissions
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_permission_tenant_isolation_policy" ON "role_permissions"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- audit_logs (orgId nullable — allow NULL or matching tenant)
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_tenant_isolation_policy" ON "audit_logs"
  FOR ALL
  USING ("organizationId" IS NULL OR "organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" IS NULL OR "organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));
