import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Executes a database operation within a transaction-scoped tenant context.
 *
 * Security Invariants:
 * 1. Uses PostgreSQL `set_config('app.current_tenant_id', tenantId, true)`.
 *    The `is_local = true` parameter restricts the parameter scope strictly
 *    to the current transaction (`SET LOCAL`). Upon transaction completion
 *    (COMMIT or ROLLBACK), the setting is automatically purged by the engine.
 * 2. This guarantees that pooled database connections (Prisma connection pool or
 *    PgBouncer) NEVER leak tenant context across requests.
 * 3. Rejects empty or missing tenant IDs to avoid accidental anonymous queries.
 * 4. Relies on database-level Row-Level Security (RLS) to enforce isolation.
 *
 * @param tenantId The cryptographically authenticated organization UUID.
 * @param callback The transactional database operations to execute.
 * @param client Optional PrismaClient instance (defaults to shared singleton).
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  if (!tenantId || typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error(
      "Security Invariant Violation: withTenantContext requires a non-empty, validated tenant ID",
    );
  }

  const cleanTenantId = tenantId.trim();

  return client.$transaction(async (tx) => {
    // Parameterized query setting local transaction variable
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${cleanTenantId}, true)`;
    return callback(tx);
  });
}

/**
 * Returns raw SQL for setting the transaction-local tenant context.
 * Useful for raw query builders and integration test runners.
 */
export function getSetTenantContextSQL(tenantId: string): string {
  // Safe single-quote escaping for raw SQL execution
  const escaped = tenantId.replace(/'/g, "''");
  return `SELECT set_config('app.current_tenant_id', '${escaped}', true);`;
}

/**
 * Returns raw SQL for clearing tenant context in tests or session resets.
 */
export function getResetTenantContextSQL(): string {
  return `SELECT set_config('app.current_tenant_id', '', true);`;
}
