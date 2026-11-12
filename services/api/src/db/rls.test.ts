import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("PostgreSQL Database-Level Row-Level Security (RLS)", () => {
  let db: PGlite;

  const TENANT_A_ID = "11111111-1111-4111-8111-111111111111";
  const TENANT_B_ID = "22222222-2222-4222-8222-222222222222";

  const LOC_A1_ID = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LOC_B1_ID = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeAll(async () => {
    // Spin up real embedded PostgreSQL 16 engine
    db = new PGlite();

    // 1. Load and execute the exact Phase 0.5 baseline migration
    const migrationPath = path.resolve(
      __dirname,
      "../../prisma/migrations/20261112200000_init/migration.sql",
    );
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    await db.exec(migrationSql);

    // 2. Create unprivileged application runtime role (NOSUPERUSER, NOBYPASSRLS)
    // In PostgreSQL, superusers bypass RLS by design in PostgreSQL C engine.
    // The application database user must be an unprivileged role subject to RLS.
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'apollo_app') THEN
          CREATE ROLE apollo_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
      END
      $$;
      GRANT USAGE ON SCHEMA public TO apollo_app;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO apollo_app;
    `);

    // 3. Seed test tenants as superuser
    await db.query(
      `INSERT INTO "organizations" ("id", "slug", "name", "updatedAt") VALUES ($1, $2, $3, NOW());`,
      [TENANT_A_ID, "bistro-a", "Bistro Alpha"],
    );
    await db.query(
      `INSERT INTO "locations" ("id", "organizationId", "name", "code", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [LOC_A1_ID, TENANT_A_ID, "Alpha Downtown", "DT-01"],
    );

    await db.query(
      `INSERT INTO "organizations" ("id", "slug", "name", "updatedAt") VALUES ($1, $2, $3, NOW());`,
      [TENANT_B_ID, "trattoria-b", "Trattoria Beta"],
    );
    await db.query(
      `INSERT INTO "locations" ("id", "organizationId", "name", "code", "updatedAt") VALUES ($1, $2, $3, $4, NOW());`,
      [LOC_B1_ID, TENANT_B_ID, "Beta Uptown", "UP-01"],
    );

    // 4. Switch current session role to the unprivileged application role
    await db.exec("SET ROLE apollo_app;");
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it("1. Missing tenant context denies all access to tenant-owned records", async () => {
    // Clear tenant context
    await db.exec(`SELECT set_config('app.current_tenant_id', '', false);`);

    const orgs = await db.query(`SELECT * FROM "organizations";`);
    const locations = await db.query(`SELECT * FROM "locations";`);

    // Zero-trust RLS: without a verified tenant context, queries return 0 rows
    expect(orgs.rows.length).toBe(0);
    expect(locations.rows.length).toBe(0);
  });

  it("2. Tenant A can access its own records", async () => {
    // Establish transaction-local tenant context for Tenant A
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    const orgs = await db.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "organizations";`,
    );
    const locations = await db.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "locations";`,
    );

    await db.exec("COMMIT;");

    expect(orgs.rows.length).toBe(1);
    expect(orgs.rows[0]?.id).toBe(TENANT_A_ID);
    expect(orgs.rows[0]?.name).toBe("Bistro Alpha");

    expect(locations.rows.length).toBe(1);
    expect(locations.rows[0]?.id).toBe(LOC_A1_ID);
    expect(locations.rows[0]?.name).toBe("Alpha Downtown");
  });

  it("3. Tenant A CANNOT read Tenant B's records", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    // Direct query for Tenant B's records by primary key
    const orgB = await db.query(
      `SELECT * FROM "organizations" WHERE "id" = '${TENANT_B_ID}';`,
    );
    const locB = await db.query(
      `SELECT * FROM "locations" WHERE "id" = '${LOC_B1_ID}';`,
    );

    await db.exec("COMMIT;");

    // RLS policy prevents visibility of Tenant B's rows
    expect(orgB.rows.length).toBe(0);
    expect(locB.rows.length).toBe(0);
  });

  it("4. Tenant A CANNOT update Tenant B's records", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    // Tenant A attempt to modify Tenant B's location
    const updateResult = await db.query(
      `UPDATE "locations" SET "name" = 'Hacked by Tenant A' WHERE "id" = '${LOC_B1_ID}';`,
    );

    await db.exec("COMMIT;");

    // Zero rows affected
    expect(updateResult.affectedRows ?? 0).toBe(0);

    // Verify record was untouched by querying as Tenant B
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_B_ID}', true);`,
    );
    const locCheck = await db.query<{ name: string }>(
      `SELECT "name" FROM "locations" WHERE "id" = '${LOC_B1_ID}';`,
    );
    await db.exec("COMMIT;");

    expect(locCheck.rows[0]?.name).toBe("Beta Uptown");
  });

  it("5. Tenant A CANNOT delete Tenant B's records", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    // Tenant A attempt to delete Tenant B's location
    const deleteResult = await db.query(
      `DELETE FROM "locations" WHERE "id" = '${LOC_B1_ID}';`,
    );

    await db.exec("COMMIT;");

    // Zero rows affected
    expect(deleteResult.affectedRows ?? 0).toBe(0);

    // Verify record still exists under Tenant B
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_B_ID}', true);`,
    );
    const locCheck = await db.query(
      `SELECT * FROM "locations" WHERE "id" = '${LOC_B1_ID}';`,
    );
    await db.exec("COMMIT;");

    expect(locCheck.rows.length).toBe(1);
  });

  it("6. Tenant A CANNOT insert records for Tenant B (WITH CHECK violation)", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    let errorThrown = false;
    try {
      // Tenant A attempts to inject location into Tenant B's organization
      await db.query(
        `INSERT INTO "locations" ("id", "organizationId", "name", "code", "updatedAt") 
         VALUES ('fake-loc-id', '${TENANT_B_ID}', 'Trojan Location', 'TJ-01', NOW());`,
      );
    } catch (err: unknown) {
      errorThrown = true;
      expect((err as Error).message).toContain(
        "violates row-level security policy",
      );
    } finally {
      await db.exec("ROLLBACK;");
    }

    expect(errorThrown).toBe(true);
  });

  it("7. Tenant context does NOT leak between pooled transactions (is_local = true)", async () => {
    // Transaction 1: Tenant A sets context with is_local = true
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );
    const tx1Res = await db.query(`SELECT "id" FROM "organizations";`);
    expect(tx1Res.rows.length).toBe(1);
    await db.exec("COMMIT;");

    // Transaction 2: Next pooled request without setting tenant context
    await db.exec("BEGIN;");
    const currentSettingRes = await db.query<{ current_setting: string }>(
      `SELECT current_setting('app.current_tenant_id', true) as current_setting;`,
    );
    const setting = currentSettingRes.rows[0]?.current_setting;
    expect(setting === "" || setting === null).toBe(true);

    const tx2Res = await db.query(`SELECT * FROM "organizations";`);
    await db.exec("COMMIT;");

    // Setting automatically reverted — zero rows visible, no leakage
    expect(tx2Res.rows.length).toBe(0);
  });

  it("8. Unprivileged application role apollo_app cannot bypass RLS", async () => {
    // Confirm the current role is apollo_app and does not have BYPASSRLS
    const roleCheck = await db.query<{
      rolname: string;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER;`,
    );
    expect(roleCheck.rows[0]?.rolname).toBe("apollo_app");
    expect(roleCheck.rows[0]?.rolbypassrls).toBe(false);

    // Without setting tenant context, access is unconditionally denied
    await db.exec(`SELECT set_config('app.current_tenant_id', '', false);`);
    const orgs = await db.query(`SELECT * FROM "organizations";`);
    expect(orgs.rows.length).toBe(0);
  });
});
