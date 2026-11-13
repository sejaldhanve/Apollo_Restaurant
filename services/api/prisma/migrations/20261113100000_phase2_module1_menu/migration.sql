-- Phase 2 — Module 1: Restaurant Configuration & Menu Domain (additive migration)
-- Adds StationType enum, configuration & menu tables, and strict RLS tenant isolation policies.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CREATE ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────

CREATE TYPE "StationType" AS ENUM ('KITCHEN', 'BAR', 'GRILL', 'SALAD', 'PIZZA', 'EXPO', 'DESSERT');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CREATE CONFIGURATION & MENU TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- kitchen_stations
CREATE TABLE "kitchen_stations" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId"     TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "type"           "StationType" NOT NULL DEFAULT 'KITCHEN',
  "isExpo"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kitchen_stations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kitchen_stations_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "kitchen_stations_locationId_code_key" ON "kitchen_stations"("locationId", "code");
CREATE INDEX "kitchen_stations_organizationId_idx" ON "kitchen_stations"("organizationId");

-- tax_rates
CREATE TABLE "tax_rates" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"  TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "rateBasisPoints" INTEGER NOT NULL,
  "isDefault"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tax_rates_organizationId_idx" ON "tax_rates"("organizationId");

-- menus
CREATE TABLE "menus" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "schedule"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "menus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menus_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "menus_organizationId_idx" ON "menus"("organizationId");

-- menu_categories
CREATE TABLE "menu_categories" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "menuId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_categories_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_categories_menuId_fkey"
    FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "menu_categories_organizationId_idx" ON "menu_categories"("organizationId");
CREATE INDEX "menu_categories_menuId_sortOrder_idx" ON "menu_categories"("menuId", "sortOrder");

-- menu_items
CREATE TABLE "menu_items" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"   TEXT NOT NULL,
  "categoryId"       TEXT NOT NULL,
  "kitchenStationId" TEXT,
  "taxRateId"        TEXT,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "sku"              TEXT,
  "basePriceCents"   INTEGER NOT NULL,
  "isAvailable"      BOOLEAN NOT NULL DEFAULT true,
  "prepTimeMinutes"  INTEGER NOT NULL DEFAULT 15,
  "calories"         INTEGER,
  "allergens"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_items_kitchenStationId_fkey"
    FOREIGN KEY ("kitchenStationId") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "menu_items_taxRateId_fkey"
    FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "menu_items_organizationId_idx" ON "menu_items"("organizationId");
CREATE INDEX "menu_items_categoryId_idx" ON "menu_items"("categoryId");

-- modifier_groups
CREATE TABLE "modifier_groups" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "minSelections"  INTEGER NOT NULL DEFAULT 0,
  "maxSelections"  INTEGER NOT NULL DEFAULT 1,
  "isRequired"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "modifier_groups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "modifier_groups_organizationId_idx" ON "modifier_groups"("organizationId");

-- menu_item_modifier_groups
CREATE TABLE "menu_item_modifier_groups" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"  TEXT NOT NULL,
  "menuItemId"      TEXT NOT NULL,
  "modifierGroupId" TEXT NOT NULL,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_item_modifier_groups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_item_modifier_groups_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "menu_item_modifier_groups_modifierGroupId_fkey"
    FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "menu_item_modifier_groups_menuItemId_modifierGroupId_key"
  ON "menu_item_modifier_groups"("menuItemId", "modifierGroupId");
CREATE INDEX "menu_item_modifier_groups_organizationId_idx"
  ON "menu_item_modifier_groups"("organizationId");

-- modifier_options
CREATE TABLE "modifier_options" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"  TEXT NOT NULL,
  "modifierGroupId" TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "isAvailable"     BOOLEAN NOT NULL DEFAULT true,
  "isDefault"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "modifier_options_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "modifier_options_modifierGroupId_fkey"
    FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "modifier_options_organizationId_idx" ON "modifier_options"("organizationId");
CREATE INDEX "modifier_options_modifierGroupId_idx" ON "modifier_options"("modifierGroupId");

-- location_menu_overrides
CREATE TABLE "location_menu_overrides" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"     TEXT NOT NULL,
  "locationId"         TEXT NOT NULL,
  "menuItemId"         TEXT NOT NULL,
  "overridePriceCents" INTEGER,
  "isAvailable"        BOOLEAN,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "location_menu_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_menu_overrides_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "location_menu_overrides_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "location_menu_overrides_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "location_menu_overrides_locationId_menuItemId_key"
  ON "location_menu_overrides"("locationId", "menuItemId");
CREATE INDEX "location_menu_overrides_organizationId_idx"
  ON "location_menu_overrides"("organizationId");

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY — All 8 Tenant-Scoped Tables
-- ────────────────────────────────────────────────────────────────────────────

-- kitchen_stations
ALTER TABLE "kitchen_stations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kitchen_stations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "kitchen_stations_tenant_isolation_policy" ON "kitchen_stations"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- tax_rates
ALTER TABLE "tax_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tax_rates_tenant_isolation_policy" ON "tax_rates"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- menus
ALTER TABLE "menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menus" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menus_tenant_isolation_policy" ON "menus"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- menu_categories
ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_categories_tenant_isolation_policy" ON "menu_categories"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- menu_items
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_items_tenant_isolation_policy" ON "menu_items"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- modifier_groups
ALTER TABLE "modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modifier_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "modifier_groups_tenant_isolation_policy" ON "modifier_groups"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- menu_item_modifier_groups
ALTER TABLE "menu_item_modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_item_modifier_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_item_modifier_groups_tenant_isolation_policy" ON "menu_item_modifier_groups"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- modifier_options
ALTER TABLE "modifier_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modifier_options" FORCE ROW LEVEL SECURITY;
CREATE POLICY "modifier_options_tenant_isolation_policy" ON "modifier_options"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- location_menu_overrides
ALTER TABLE "location_menu_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_menu_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY "location_menu_overrides_tenant_isolation_policy" ON "location_menu_overrides"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

