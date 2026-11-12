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

  const USER_A_ID = "u1111111-1111-4111-8111-111111111111";
  const USER_B_ID = "u2222222-2222-4222-8222-222222222222";

  const ROLE_A_OWNER_ID = "r1111111-1111-4111-8111-111111111111";
  const ROLE_B_OWNER_ID = "r2222222-2222-4222-8222-222222222222";

  const MEM_A_ID = "m1111111-1111-4111-8111-111111111111";
  const MEM_B_ID = "m2222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    // Spin up real embedded PostgreSQL 16 engine
    db = new PGlite();

    // 1. Load and execute the Phase 0.5 baseline migration
    const migration0Path = path.resolve(
      __dirname,
      "../../prisma/migrations/20261112200000_init/migration.sql",
    );
    const migration0Sql = fs.readFileSync(migration0Path, "utf-8");
    await db.exec(migration0Sql);

    // 2. Load and execute the Phase 1 domain and auth migration
    const migration1Path = path.resolve(
      __dirname,
      "../../prisma/migrations/20261113000000_phase1_domain_auth/migration.sql",
    );
    const migration1Sql = fs.readFileSync(migration1Path, "utf-8");
    await db.exec(migration1Sql);

    // 3. Create unprivileged application runtime role (NOSUPERUSER, NOBYPASSRLS)
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

    // 4. Seed test tenants and records as superuser
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

    // Global users
    await db.query(
      `INSERT INTO "users" ("id", "email", "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, $2, 'hashA', 'Alice', 'Owner', NOW()), ($3, $4, 'hashB', 'Bob', 'Owner', NOW());`,
      [USER_A_ID, "alice@alpha.com", USER_B_ID, "bob@beta.com"],
    );

    // Roles for Tenant A and Tenant B
    await db.query(
      `INSERT INTO "roles" ("id", "organizationId", "name", "updatedAt")
       VALUES ($1, $2, 'Owner', NOW()), ($3, $4, 'Owner', NOW());`,
      [ROLE_A_OWNER_ID, TENANT_A_ID, ROLE_B_OWNER_ID, TENANT_B_ID],
    );

    // Memberships for Tenant A and Tenant B
    await db.query(
      `INSERT INTO "organization_memberships" ("id", "userId", "organizationId", "roleId", "status", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW()), ($5, $6, $7, $8, 'ACTIVE', NOW());`,
      [
        MEM_A_ID,
        USER_A_ID,
        TENANT_A_ID,
        ROLE_A_OWNER_ID,
        MEM_B_ID,
        USER_B_ID,
        TENANT_B_ID,
        ROLE_B_OWNER_ID,
      ],
    );

    // 5. Switch current session role to the unprivileged application role
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
    const roles = await db.query(`SELECT * FROM "roles";`);
    const memberships = await db.query(
      `SELECT * FROM "organization_memberships";`,
    );

    // Zero-trust RLS: without a verified tenant context, queries return 0 rows
    expect(orgs.rows.length).toBe(0);
    expect(locations.rows.length).toBe(0);
    expect(roles.rows.length).toBe(0);
    expect(memberships.rows.length).toBe(0);
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
    const roles = await db.query<{ id: string; name: string }>(
      `SELECT "id", "name" FROM "roles";`,
    );
    const memberships = await db.query<{ id: string }>(
      `SELECT "id" FROM "organization_memberships";`,
    );

    await db.exec("COMMIT;");

    expect(orgs.rows.length).toBe(1);
    expect(orgs.rows[0]?.id).toBe(TENANT_A_ID);
    expect(orgs.rows[0]?.name).toBe("Bistro Alpha");

    expect(locations.rows.length).toBe(1);
    expect(locations.rows[0]?.id).toBe(LOC_A1_ID);

    expect(roles.rows.length).toBe(1);
    expect(roles.rows[0]?.id).toBe(ROLE_A_OWNER_ID);

    expect(memberships.rows.length).toBe(1);
    expect(memberships.rows[0]?.id).toBe(MEM_A_ID);
  });

  it("3. Tenant A CANNOT read Tenant B's records across any tenant table", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    const orgB = await db.query(
      `SELECT * FROM "organizations" WHERE "id" = '${TENANT_B_ID}';`,
    );
    const locB = await db.query(
      `SELECT * FROM "locations" WHERE "id" = '${LOC_B1_ID}';`,
    );
    const roleB = await db.query(
      `SELECT * FROM "roles" WHERE "id" = '${ROLE_B_OWNER_ID}';`,
    );
    const memB = await db.query(
      `SELECT * FROM "organization_memberships" WHERE "id" = '${MEM_B_ID}';`,
    );

    await db.exec("COMMIT;");

    expect(orgB.rows.length).toBe(0);
    expect(locB.rows.length).toBe(0);
    expect(roleB.rows.length).toBe(0);
    expect(memB.rows.length).toBe(0);
  });

  it("4. Tenant A CANNOT update Tenant B's records", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    const updateLoc = await db.query(
      `UPDATE "locations" SET "name" = 'Hacked' WHERE "id" = '${LOC_B1_ID}';`,
    );
    const updateRole = await db.query(
      `UPDATE "roles" SET "name" = 'HackedRole' WHERE "id" = '${ROLE_B_OWNER_ID}';`,
    );
    const updateMem = await db.query(
      `UPDATE "organization_memberships" SET "status" = 'SUSPENDED' WHERE "id" = '${MEM_B_ID}';`,
    );

    await db.exec("COMMIT;");

    expect(updateLoc.affectedRows ?? 0).toBe(0);
    expect(updateRole.affectedRows ?? 0).toBe(0);
    expect(updateMem.affectedRows ?? 0).toBe(0);
  });

  it("5. Tenant A CANNOT delete Tenant B's records", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    const deleteRole = await db.query(
      `DELETE FROM "roles" WHERE "id" = '${ROLE_B_OWNER_ID}';`,
    );
    const deleteMem = await db.query(
      `DELETE FROM "organization_memberships" WHERE "id" = '${MEM_B_ID}';`,
    );

    await db.exec("COMMIT;");

    expect(deleteRole.affectedRows ?? 0).toBe(0);
    expect(deleteMem.affectedRows ?? 0).toBe(0);
  });

  it("6. Tenant A CANNOT insert records for Tenant B (WITH CHECK violation)", async () => {
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    let errorThrown = false;
    try {
      await db.query(
        `INSERT INTO "roles" ("id", "organizationId", "name", "updatedAt")
         VALUES ('malicious-role', '${TENANT_B_ID}', 'Injected Role', NOW());`,
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
    const roleCheck = await db.query<{
      rolname: string;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER;`,
    );
    expect(roleCheck.rows[0]?.rolname).toBe("apollo_app");
    expect(roleCheck.rows[0]?.rolbypassrls).toBe(false);

    await db.exec(`SELECT set_config('app.current_tenant_id', '', false);`);
    const orgs = await db.query(`SELECT * FROM "organizations";`);
    expect(orgs.rows.length).toBe(0);
  });

  it("9. Global users table is accessible across organizations without RLS", async () => {
    // Users are global identity accounts; authentication looks up users across organizations
    const users = await db.query<{ id: string }>(`SELECT "id" FROM "users";`);
    expect(users.rows.length).toBe(2);
  });

  it("10. Audit logs with tenant ID are isolated; system logs (orgId IS NULL) are accessible", async () => {
    // Insert audit log for Tenant A and Tenant B as superuser
    await db.exec("RESET ROLE;");
    await db.query(
      `INSERT INTO "audit_logs" ("id", "organizationId", "action", "createdAt")
       VALUES ('log-a', '${TENANT_A_ID}', 'test.action.a', NOW()),
              ('log-b', '${TENANT_B_ID}', 'test.action.b', NOW()),
              ('log-sys', NULL, 'system.boot', NOW());`,
    );
    await db.exec("SET ROLE apollo_app;");

    // Query as Tenant A
    await db.exec("BEGIN;");
    await db.exec(
      `SELECT set_config('app.current_tenant_id', '${TENANT_A_ID}', true);`,
    );

    const logsA = await db.query<{ id: string }>(
      `SELECT "id" FROM "audit_logs" ORDER BY "id";`,
    );
    await db.exec("COMMIT;");

    // Tenant A sees log-a and log-sys (NULL orgId), but NEVER log-b
    const logIds = logsA.rows.map((r) => r.id);
    expect(logIds).toContain("log-a");
    expect(logIds).toContain("log-sys");
    expect(logIds).not.toContain("log-b");
  });
});
