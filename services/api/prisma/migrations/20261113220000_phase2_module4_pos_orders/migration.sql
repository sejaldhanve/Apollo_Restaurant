-- ────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Module 4: Point of Sale (POS) & Order Management Domain
-- Multi-tenant schema with strict PostgreSQL Row Level Security (RLS)
-- ────────────────────────────────────────────────────────────────────────────

-- 1. ENUMS
DROP TYPE IF EXISTS "OrderStatus" CASCADE;
CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_PREPARATION',
  'READY',
  'SERVED',
  'CANCELLED'
);

DROP TYPE IF EXISTS "OrderItemStatus" CASCADE;
CREATE TYPE "OrderItemStatus" AS ENUM (
  'PENDING',
  'IN_PREPARATION',
  'READY',
  'SERVED',
  'CANCELLED'
);

DROP TYPE IF EXISTS "PaymentStatus" CASCADE;
CREATE TYPE "PaymentStatus" AS ENUM (
  'UNPAID',
  'PENDING',
  'PAID',
  'FAILED'
);

-- 2. ORDERS TABLE
CREATE TABLE "orders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "tableId" TEXT,
  "tableSessionId" TEXT,
  "serverUserId" TEXT,
  "orderNumber" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "guestCount" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "idempotencyKey" TEXT,
  "submittedAt" TIMESTAMP(3),
  "preparedAt" TIMESTAMP(3),
  "servedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "orders_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "orders_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_tableSessionId_fkey"
    FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "orders_serverUserId_fkey"
    FOREIGN KEY ("serverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "orders_organizationId_idx" ON "orders"("organizationId");
CREATE INDEX "orders_locationId_status_idx" ON "orders"("locationId", "status");
CREATE INDEX "orders_tableId_idx" ON "orders"("tableId");
CREATE INDEX "orders_tableSessionId_idx" ON "orders"("tableSessionId");
CREATE INDEX "orders_serverUserId_idx" ON "orders"("serverUserId");
CREATE UNIQUE INDEX "orders_org_idempotency_idx" ON "orders"("organizationId", "idempotencyKey");

-- 3. ORDER ITEMS TABLE
CREATE TABLE "order_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "kitchenStationId" TEXT,
  "name" TEXT NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "subtotalCents" INTEGER NOT NULL,
  "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
  "specialInstructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_kitchenStationId_fkey"
    FOREIGN KEY ("kitchenStationId") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "order_items_organizationId_idx" ON "order_items"("organizationId");
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_kitchenStationId_status_idx" ON "order_items"("kitchenStationId", "status");

-- 4. ORDER ITEM MODIFIERS TABLE
CREATE TABLE "order_item_modifiers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "modifierGroupId" TEXT,
  "modifierOptionId" TEXT,
  "groupName" TEXT NOT NULL,
  "optionName" TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_item_modifiers_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_item_modifiers_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_item_modifiers_modifierGroupId_fkey"
    FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "order_item_modifiers_modifierOptionId_fkey"
    FOREIGN KEY ("modifierOptionId") REFERENCES "modifier_options"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "order_item_modifiers_organizationId_idx" ON "order_item_modifiers"("organizationId");
CREATE INDEX "order_item_modifiers_orderItemId_idx" ON "order_item_modifiers"("orderItemId");

-- 5. PAYMENTS TABLE
CREATE TABLE "payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "paymentMethod" TEXT,
  "referenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS) TENANT ISOLATION POLICIES
-- ────────────────────────────────────────────────────────────────────────────

-- orders
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "orders_tenant_isolation_policy" ON "orders"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- order_items
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "order_items_tenant_isolation_policy" ON "order_items"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- order_item_modifiers
ALTER TABLE "order_item_modifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_item_modifiers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "order_item_modifiers_tenant_isolation_policy" ON "order_item_modifiers"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));

-- payments
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payments_tenant_isolation_policy" ON "payments"
  FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));
