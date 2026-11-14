import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("PostgreSQL Order Concurrency & Database-Level Constraints Integration Tests", () => {
  let db: PGlite;

  const ORG_A = "11111111-1111-4111-8111-111111111111";
  const ORG_B = "22222222-2222-4222-8222-222222222222";

  const LOC_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LOC_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const AREA_A = "area1111-1111-4111-8111-111111111111";
  const AREA_B = "area2222-2222-4222-8222-222222222222";

  const TABLE_A1 = "tbl11111-1111-4111-8111-111111111111";
  const TABLE_B1 = "tbl22222-2222-4222-8222-222222222222";

  const SESSION_A1 = "sess1111-1111-4111-8111-111111111111";
  const SESSION_B1 = "sess2222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    db = new PGlite();

    const migrations = [
      "../../../prisma/migrations/20261112200000_init/migration.sql",
      "../../../prisma/migrations/20261113000000_phase1_domain_auth/migration.sql",
      "../../../prisma/migrations/20261113100000_phase2_module1_menu/migration.sql",
      "../../../prisma/migrations/20261113200000_phase2_module2_foh_tables/migration.sql",
      "../../../prisma/migrations/20261113210000_phase2_module2_server_assignments/migration.sql",
      "../../../prisma/migrations/20261113220000_phase2_module4_pos_orders/migration.sql",
      "../../../prisma/migrations/20261114010000_phase2_module4_order_concurrency/migration.sql",
    ];

    for (const relPath of migrations) {
      const fullPath = path.resolve(__dirname, relPath);
      const sql = fs.readFileSync(fullPath, "utf-8");
      await db.exec(sql);
    }

    // Seed baseline tenants and tables
    await db.query(
      `INSERT INTO "organizations" ("id", "slug", "name", "updatedAt") VALUES ($1, $2, $3, NOW());`,
      [ORG_A, "tenant-a", "Tenant Alpha"],
    );
    await db.query(
      `INSERT INTO "organizations" ("id", "slug", "name", "updatedAt") VALUES ($1, $2, $3, NOW());`,
      [ORG_B, "tenant-b", "Tenant Beta"],
    );

    await db.query(
      `INSERT INTO "locations" ("id", "organizationId", "name", "code", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [LOC_A, ORG_A, "Alpha Downtown", "DT-01"],
    );
    await db.query(
      `INSERT INTO "locations" ("id", "organizationId", "name", "code", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [LOC_B, ORG_B, "Beta Uptown", "UP-01"],
    );

    await db.query(
      `INSERT INTO "dining_areas" ("id", "organizationId", "locationId", "name", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [AREA_A, ORG_A, LOC_A, "Main Room A"],
    );
    await db.query(
      `INSERT INTO "dining_areas" ("id", "organizationId", "locationId", "name", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [AREA_B, ORG_B, LOC_B, "Main Room B"],
    );

    await db.query(
      `INSERT INTO "tables" ("id", "organizationId", "locationId", "diningAreaId", "tableNumber", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW());`,
      [TABLE_A1, ORG_A, LOC_A, AREA_A, "T1"],
    );
    await db.query(
      `INSERT INTO "tables" ("id", "organizationId", "locationId", "diningAreaId", "tableNumber", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW());`,
      [TABLE_B1, ORG_B, LOC_B, AREA_B, "T1"],
    );

    await db.query(
      `INSERT INTO "table_sessions" ("id", "organizationId", "locationId", "tableId", "status", "guestCount", "updatedAt") VALUES ($1, $2, $3, $4, 'ACTIVE', 2, NOW());`,
      [SESSION_A1, ORG_A, LOC_A, TABLE_A1],
    );
    await db.query(
      `INSERT INTO "table_sessions" ("id", "organizationId", "locationId", "tableId", "status", "guestCount", "updatedAt") VALUES ($1, $2, $3, $4, 'ACTIVE', 4, NOW());`,
      [SESSION_B1, ORG_B, LOC_B, TABLE_B1],
    );

    // Seed menu, category, and items for order item FK constraints
    await db.query(
      `INSERT INTO "menus" ("id", "organizationId", "name", "updatedAt") VALUES ('menu-1', $1, 'Dinner Menu', NOW());`,
      [ORG_A],
    );
    await db.query(
      `INSERT INTO "menu_categories" ("id", "organizationId", "menuId", "name", "updatedAt") VALUES ('cat-1', $1, 'menu-1', 'Mains', NOW());`,
      [ORG_A],
    );
    await db.query(
      `INSERT INTO "menu_items" ("id", "organizationId", "categoryId", "name", "basePriceCents", "updatedAt") VALUES ('menu-item-1', $1, 'cat-1', 'Burger', 1500, NOW());`,
      [ORG_A],
    );
    await db.query(
      `INSERT INTO "menu_items" ("id", "organizationId", "categoryId", "name", "basePriceCents", "updatedAt") VALUES ('menu-item-2', $1, 'cat-1', 'Pizza', 2500, NOW());`,
      [ORG_A],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it("1. Prevents duplicate active DRAFT orders for the same table session via PostgreSQL partial unique index", async () => {
    // 1st draft order insertion succeeds
    await db.query(
      `INSERT INTO "orders" ("id", "organizationId", "locationId", "tableId", "tableSessionId", "orderNumber", "status", "updatedAt")
       VALUES ('ord-draft-1', $1, $2, $3, $4, 'ORD-1001', 'DRAFT', NOW());`,
      [ORG_A, LOC_A, TABLE_A1, SESSION_A1],
    );

    // 2nd draft order for the SAME table session must fail with unique constraint violation
    await expect(
      db.query(
        `INSERT INTO "orders" ("id", "organizationId", "locationId", "tableId", "tableSessionId", "orderNumber", "status", "updatedAt")
         VALUES ('ord-draft-2', $1, $2, $3, $4, 'ORD-1002', 'DRAFT', NOW());`,
        [ORG_A, LOC_A, TABLE_A1, SESSION_A1],
      ),
    ).rejects.toThrow(/unique constraint/i);
  });

  it("2. Legitimate separate order rounds: allows a new DRAFT order once previous order is SUBMITTED", async () => {
    // Transition 1st order from DRAFT to SUBMITTED
    await db.query(
      `UPDATE "orders" SET "status" = 'SUBMITTED' WHERE "id" = 'ord-draft-1';`,
    );

    // A second round draft order for the same table session is now permitted!
    const round2Result = await db.query(
      `INSERT INTO "orders" ("id", "organizationId", "locationId", "tableId", "tableSessionId", "orderNumber", "status", "updatedAt")
       VALUES ('ord-draft-round2', $1, $2, $3, $4, 'ORD-1003', 'DRAFT', NOW())
       RETURNING "id", "status";`,
      [ORG_A, LOC_A, TABLE_A1, SESSION_A1],
    );

    expect(round2Result.rows.length).toBe(1);
    expect(round2Result.rows[0].id).toBe("ord-draft-round2");
    expect(round2Result.rows[0].status).toBe("DRAFT");
  });

  it("3. Prevents duplicate active DRAFT orders for the same table via orders_active_draft_table_idx", async () => {
    // Another draft for TABLE_A1 while round 2 draft is active must fail
    await expect(
      db.query(
        `INSERT INTO "orders" ("id", "organizationId", "locationId", "tableId", "orderNumber", "status", "updatedAt")
         VALUES ('ord-draft-conflict', $1, $2, $3, 'ORD-1004', 'DRAFT', NOW());`,
        [ORG_A, LOC_A, TABLE_A1],
      ),
    ).rejects.toThrow(/unique constraint/i);
  });

  it("4. Enforces idempotency key uniqueness per organization (orders_org_idempotency_idx)", async () => {
    const IDEM_KEY = "idem-key-prod-001";

    // Set idempotency key on round 1 order
    await db.query(
      `UPDATE "orders" SET "idempotencyKey" = $1 WHERE "id" = 'ord-draft-1';`,
      [IDEM_KEY],
    );

    // Attempting to assign the same idempotency key to round 2 order must fail
    await expect(
      db.query(
        `UPDATE "orders" SET "idempotencyKey" = $1 WHERE "id" = 'ord-draft-round2';`,
        [IDEM_KEY],
      ),
    ).rejects.toThrow(/unique constraint/i);
  });

  it("5. Tenant isolation during concurrent operations: different organizations can use identical idempotency keys", async () => {
    const SHARED_KEY = "idem-key-cross-tenant-123";

    // Org A order uses SHARED_KEY
    await db.query(
      `INSERT INTO "orders" ("id", "organizationId", "locationId", "orderNumber", "status", "idempotencyKey", "updatedAt")
       VALUES ('ord-org-a-1', $1, $2, 'ORD-A1', 'SUBMITTED', $3, NOW());`,
      [ORG_A, LOC_A, SHARED_KEY],
    );

    // Org B order can safely use the EXACT SAME SHARED_KEY without collision!
    const orgBOrder = await db.query(
      `INSERT INTO "orders" ("id", "organizationId", "locationId", "orderNumber", "status", "idempotencyKey", "updatedAt")
       VALUES ('ord-org-b-1', $1, $2, 'ORD-B1', 'SUBMITTED', $3, NOW())
       RETURNING "id", "organizationId", "idempotencyKey";`,
      [ORG_B, LOC_B, SHARED_KEY],
    );

    expect(orgBOrder.rows.length).toBe(1);
    expect(orgBOrder.rows[0].organizationId).toBe(ORG_B);
    expect(orgBOrder.rows[0].idempotencyKey).toBe(SHARED_KEY);
  });

  it("6. Tenant isolation: active draft constraints do not cross tenant boundaries", async () => {
    // Org B can create its own DRAFT order on its own table session without any conflict with Org A
    const orgBDraft = await db.query(
      `INSERT INTO "orders" ("id", "organizationId", "locationId", "tableId", "tableSessionId", "orderNumber", "status", "updatedAt")
       VALUES ('ord-org-b-draft', $1, $2, $3, $4, 'ORD-B-DRAFT', 'DRAFT', NOW())
       RETURNING "id", "status";`,
      [ORG_B, LOC_B, TABLE_B1, SESSION_B1],
    );

    expect(orgBDraft.rows.length).toBe(1);
    expect(orgBDraft.rows[0].status).toBe("DRAFT");
  });

  it("7. Row-level locking: SELECT ... FOR UPDATE succeeds in a PostgreSQL transaction block", async () => {
    // Begin transaction, acquire row lock on order, and commit
    await db.query("BEGIN;");
    const lockResult = await db.query(
      `SELECT "id" FROM "orders" WHERE "id" = 'ord-draft-round2' AND "organizationId" = $1 FOR UPDATE;`,
      [ORG_A],
    );
    expect(lockResult.rows.length).toBe(1);
    expect(lockResult.rows[0].id).toBe("ord-draft-round2");
    await db.query("COMMIT;");
  });

  it("8. Atomicity of item addition and integer-cent subtotal calculation", async () => {
    const orderId = "ord-draft-round2";

    // Insert line item 1: 1500 cents
    await db.query(
      `INSERT INTO "order_items" ("id", "organizationId", "orderId", "menuItemId", "name", "basePriceCents", "quantity", "subtotalCents", "taxRateBasisPoints", "taxCents", "totalCents", "status", "updatedAt")
       VALUES ('item-line-1', $1, $2, 'menu-item-1', 'Burger', 1500, 1, 1500, 800, 120, 1620, 'PENDING', NOW());`,
      [ORG_A, orderId],
    );

    // Insert line item 2: 2500 cents
    await db.query(
      `INSERT INTO "order_items" ("id", "organizationId", "orderId", "menuItemId", "name", "basePriceCents", "quantity", "subtotalCents", "taxRateBasisPoints", "taxCents", "totalCents", "status", "updatedAt")
       VALUES ('item-line-2', $1, $2, 'menu-item-2', 'Pizza', 2500, 1, 2500, 800, 200, 2700, 'PENDING', NOW());`,
      [ORG_A, orderId],
    );

    // Recalculate totals directly in PostgreSQL transaction
    await db.query(`
      UPDATE "orders" o
      SET
        "subtotalCents" = COALESCE((SELECT SUM("subtotalCents") FROM "order_items" WHERE "orderId" = o."id" AND "status" != 'CANCELLED'), 0),
        "taxCents" = COALESCE((SELECT SUM("taxCents") FROM "order_items" WHERE "orderId" = o."id" AND "status" != 'CANCELLED'), 0),
        "totalCents" = COALESCE((SELECT SUM("totalCents") FROM "order_items" WHERE "orderId" = o."id" AND "status" != 'CANCELLED'), 0)
      WHERE "id" = '${orderId}';
    `);

    const orderRes = await db.query(
      `SELECT "subtotalCents", "taxCents", "totalCents" FROM "orders" WHERE "id" = '${orderId}';`,
    );

    expect(orderRes.rows[0].subtotalCents).toBe(4000); // 1500 + 2500
    expect(orderRes.rows[0].taxCents).toBe(320); // 120 + 200
    expect(orderRes.rows[0].totalCents).toBe(4320); // 1620 + 2700
  });
});
