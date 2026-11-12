# Apollo Restaurant OS — Phase 0.5 Foundation Remediation Report

**Document Version:** 1.0.0  
**Status:** Completed & Verified  
**Date:** 2026-11-12  
**Target Milestone:** Phase 1 Readiness Gate  
**Scope:** Remediation of Phase 0 Architecture Audit Critical & High Findings (AUD-01, AUD-02, AUD-03, AUD-04)

---

## 1. Executive Summary

Following the comprehensive Phase 0 architecture audit, this Phase 0.5 Foundation Remediation resolves all four Critical and High severity findings identified in `docs/architecture/phase-0-audit-report.md`. In accordance with enterprise architectural standards and strict security boundaries, no Phase 1 business domain logic (authentication screens, POS terminal, kitchen display systems, order routing, inventory) was introduced during this remediation.

The remediation establishes:

1. **Physical Database Row-Level Security (RLS)**: Enforced directly within PostgreSQL on all tenant-owned relational tables, with non-bypassable unprivileged database roles (`apollo_app`) and transaction-scoped context isolation (`set_config(..., true)`).
2. **Initial Physical Migration (`20261112200000_init`)**: Generated and ordered standard DDL + SQL RLS policies in Prisma's native migration directory structure, accompanied by schema consistency checks.
3. **Resilient Redis-Backed Rate Limiting**: Distributed rate-limiting middleware mounted globally (`/api/v1`) with draft-6 standard headers, RFC-compliant error responses, and explicit fail-open resiliency during transient cache outages to preserve critical restaurant uptime.
4. **Strict Monorepo Workspace Linking**: Replaced loose and duplicated types/configurations with pnpm `workspace:*` dependencies across `@apollo/shared-types`, `@apollo/config`, `@apollo/api`, and `@apollo/web`.

All 19 automated tests (backend, frontend, Python multi-agent system) pass, and all workspace typecheck, lint, and formatting checks are 100% clean.

---

## 2. Audit Finding Remediation Matrix

| Finding ID | Severity     | Description                                                               | Status       | Remediation Summary                                                                                                                                                                                                                                                                       |
| ---------- | ------------ | ------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AUD-01** | **Critical** | PostgreSQL RLS documented but not enforced at database level              | **RESOLVED** | Added `ENABLE/FORCE ROW LEVEL SECURITY` and multi-tenant policies on all tenant tables. Implemented `withTenantContext` using local transaction `set_config('app.current_tenant_id', id, true)`. Provisioned unprivileged `apollo_app` role. Verified via 8 real PostgreSQL engine tests. |
| **AUD-02** | **High**     | In-memory API rate limiter lacking distributed Redis store and resilience | **RESOLVED** | Implemented `rate-limiter.ts` using `express-rate-limit` + `rate-limit-redis` with singleton ioredis client. Configured `passOnStoreError: true` (fail-open) and custom RFC-compliant error payload.                                                                                      |
| **AUD-03** | **High**     | Workspace packages not linked via `workspace:*` protocol                  | **RESOLVED** | Configured `workspace:*` dependencies for `@apollo/shared-types` and `@apollo/config` in `services/api` and `apps/web`. Replaced redundant local interfaces with shared definitions.                                                                                                      |
| **AUD-04** | **High**     | Absence of physical Prisma migration files                                | **RESOLVED** | Created initial ordered migration `20261112200000_init/migration.sql` with `migration_lock.toml`. Embedded table creation, constraints, indices, and RLS policies.                                                                                                                        |

---

## 3. Detailed Architecture Remediation

### 3.1. AUD-01: PostgreSQL Row-Level Security (RLS)

#### Threat Model & Security Requirements

In a multi-tenant restaurant SaaS platform, data leakage across tenant organizations (e.g., exposing one restaurant brand's financial transactions, recipes, or customer data to another brand) is a critical enterprise risk. Application-level `where: { organizationId }` clauses are vulnerable to developer oversight. RLS enforces isolation at the database engine level, acting as a defense-in-depth perimeter.

#### Implementation Architecture

1. **Unprivileged Role Provisioning (`00-init.sql`)**:
   PostgreSQL superusers and roles with `BYPASSRLS` bypass row-level security regardless of table settings. We provisioned an application role:

   ```sql
   CREATE ROLE apollo_app WITH LOGIN PASSWORD 'apollo_app_dev' NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
   GRANT CONNECT ON DATABASE apollo_db TO apollo_app;
   GRANT USAGE ON SCHEMA public TO apollo_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apollo_app;
   ```

2. **Table Identification & Policy Design**:
   Every table containing an `organizationId` column (`Organization`, `Location`, `User`, `Role`, `AuditLog`) was identified. Both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` were applied to ensure table owners are also bound by RLS:

   ```sql
   ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
   CREATE POLICY org_tenant_isolation_policy ON "organizations"
     FOR ALL
     USING ("id" = NULLIF(current_setting('app.current_tenant_id', true), ''))
     WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant_id', true), ''));

   -- Applicable to locations, users, audit_logs:
   ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
   CREATE POLICY location_tenant_isolation_policy ON "locations"
     FOR ALL
     USING ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''))
     WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_tenant_id', true), ''));
   ```

3. **Transaction-Scoped Tenant Context (`services/api/src/db/tenant-context.ts`)**:
   Connection pooling (Prisma query engine, PgBouncer) presents a risk of connection state leakage across requests. To prevent cross-request leakage, tenant identity is injected exclusively using PostgreSQL transaction-local configuration:

   ```sql
   SELECT set_config('app.current_tenant_id', $1, true);
   ```

   The third parameter `true` sets `is_local = true`, guaranteeing that PostgreSQL discards the setting immediately upon transaction `COMMIT` or `ROLLBACK`.

4. **Engine-Level Verification**:
   All 8 core RLS security test scenarios were executed and verified against a genuine PostgreSQL 16.4 engine instance (via `@electric-sql/pglite`):
   - Tenant isolation: Tenant A cannot read Tenant B's records.
   - Cross-tenant insertion rejection: Tenant A cannot insert records with Tenant B's `organizationId`.
   - Update containment: Tenant A cannot update or corrupt Tenant B's data.
   - Deletion containment: Tenant A cannot delete Tenant B's data.
   - Missing context safety: Queries without tenant context return zero records and reject inserts.
   - Superuser vs application role boundary: Verified that `apollo_app` strictly honors RLS while superuser privileges are constrained.

---

### 3.2. AUD-04: Initial Prisma Migration

#### Implementation Architecture

1. **Migration Artifacts**:
   - `services/api/prisma/migrations/migration_lock.toml` (provider: postgresql)
   - `services/api/prisma/migrations/20261112200000_init/migration.sql`
2. **Migration Structure & Idempotence**:
   The migration defines:
   - Safe extension initialization (`uuid-ossp`).
   - Core enumerated types (`UserRole`, `OrderStatus`, `OrderType`, `PaymentStatus`).
   - Tables (`organizations`, `locations`, `users`, `roles`, `audit_logs`).
   - Indices on `(organizationId, createdAt)` for high-throughput temporal queries.
   - RLS activation (`ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`).
   - Security policies for all tenant-owned entities.
3. **Application Command**:
   Local developers and CI/CD pipelines apply the migration with:
   ```bash
   pnpm --filter @apollo/api exec prisma migrate deploy
   ```

---

### 3.3. AUD-02: Redis-Backed API Rate Limiting

#### Threat Model & Operational Resiliency

In a restaurant operational environment, POS terminals and Kitchen Display Systems (KDS) generate bursts of traffic during peak lunch and dinner rushes. The rate limiter must:

1. Prevent denial-of-service (DoS) and brute-force attacks across distributed API nodes.
2. Maintain standard HTTP headers for client visibility (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
3. **Fail-Open Resilience**: If Redis becomes temporarily unreachable or suffers network degradation, restaurant operations must _never_ be halted. POS terminals must continue submitting orders.

#### Implementation Architecture

1. **Redis Client Singleton (`services/api/src/config/redis.ts`)**:
   Configured with `ioredis`, exponential backoff reconnection (`retryStrategy`), and isolated event listeners:

   ```ts
   export const redis = new Redis(env.REDIS_URL, {
     maxRetriesPerRequest: 1,
     enableReadyCheck: false,
     lazyConnect: true,
     retryStrategy(times) {
       return Math.min(times * 100, 3000);
     },
   });
   ```

2. **Middleware & Store Integration (`services/api/src/middleware/rate-limiter.ts`)**:
   Utilizes `rate-limit-redis` with `express-rate-limit`.
   - `passOnStoreError: true`: Ensures transient Redis connection drops or timeouts do not fail incoming requests with 500 errors.
   - `standardHeaders: "draft-6"`: Injects canonical RFC Draft-6 `RateLimit-*` headers alongside legacy `X-RateLimit-*`.
   - RFC-compliant error payload:
     ```json
     {
       "success": false,
       "error": {
         "code": "TOO_MANY_REQUESTS",
         "message": "Too many requests from this IP address. Please retry after some time.",
         "details": { "retryAfterSeconds": 60 }
       },
       "requestId": "..."
     }
     ```

3. **Sensitive Endpoint Configuration**:
   A dedicated `authRateLimiter` was authored with stricter limits (5 attempts / 15 minutes) specifically reserved for authentication and password-reset endpoints.

---

### 3.4. AUD-03: Workspace Dependency Linking

#### Implementation Architecture

1. **Package Declarations**:
   - `packages/shared-types/package.json`: Main, types, and exports configured to point to compiled output `dist/index.js` and `dist/index.d.ts`.
   - `packages/config/package.json`: Configured with proper export maps for shared constants and environment schemas.
2. **Workspace Consumption**:
   - `services/api/package.json`: Added `"@apollo/shared-types": "workspace:*"` and `"@apollo/config": "workspace:*"`.
   - `apps/web/package.json`: Added `"@apollo/shared-types": "workspace:*"` and `"@apollo/config": "workspace:*"`.
3. **Deduplication**:
   - Replaced duplicate `ApiResponse<T>` and `HealthCheckResponse` definitions in `apps/web/src/hooks/useHealthCheck.ts` and `services/api/src/routes/health.routes.ts` with direct imports from `@apollo/shared-types`.

---

## 4. Verification & Test Execution Results

All checks were executed against the actual code repository.

### 4.1. Automated Test Suites

| Suite                     | Component                                          | Test Count | Result          | Highlights                                                                                                         |
| ------------------------- | -------------------------------------------------- | ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Backend API**           | `services/api/src/db/rls.test.ts`                  | 8          | **PASSED**      | Real PostgreSQL 16 engine: isolation, write rejection, unprivileged role validation, missing context zero-leakage. |
| **Backend API**           | `services/api/src/middleware/rate-limiter.test.ts` | 4          | **PASSED**      | Normal allowed traffic, 429 block on burst, draft-6 headers, fail-open resilience on Redis error.                  |
| **Backend API**           | `services/api/src/routes/health.test.ts`           | 2          | **PASSED**      | Health endpoint contract, 404 handler with RFC error envelope.                                                     |
| **Frontend Web**          | `apps/web/src/App.test.tsx`                        | 1          | **PASSED**      | React 19 + TanStack Query + Zustand provider mount and navigation.                                                 |
| **Agent AI Service**      | `services/agents/tests/test_agents_base.py`        | 2          | **PASSED**      | LangGraph compiled state graph verification and invocation.                                                        |
| **Agent AI Service**      | `services/agents/tests/test_health.py`             | 2          | **PASSED**      | FastAPI agent service health endpoint structure.                                                                   |
| **Total Automated Tests** | **Repository Wide**                                | **19**     | **100% PASSED** | Zero skipped, zero failed.                                                                                         |

### 4.2. Code Quality & Static Analysis Verification

| Command                 | Target                                                  | Exit Code | Observations                                              |
| ----------------------- | ------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `pnpm run build`        | Monorepo (`shared-types`, `config`, `ui`, `api`, `web`) | `0`       | All packages compiled, Vite bundled web frontend cleanly. |
| `pnpm run typecheck`    | Monorepo (5 workspace projects)                         | `0`       | TypeScript 5.9.3 strict mode passing with zero errors.    |
| `pnpm run lint`         | Monorepo (ESLint flat config)                           | `0`       | 0 errors, 0 warnings across all workspaces.               |
| `pnpm run format:check` | Monorepo (Prettier)                                     | `0`       | All files conform strictly to formatting rules.           |
| `ruff check src tests`  | `services/agents`                                       | `0`       | All Python checks passed cleanly.                         |

---

## 5. Developer Guide: Applying Migrations Locally

To spin up and apply the database migrations in local development:

1. **Start Database Services via Docker**:
   ```bash
   docker compose up -d postgres redis
   ```
2. **Apply Migrations**:
   ```bash
   pnpm --filter @apollo/api exec prisma migrate deploy
   ```
3. **Generate Prisma Client**:
   ```bash
   pnpm --filter @apollo/api prisma:generate
   ```
4. **Run Backend RLS and API Tests**:
   ```bash
   pnpm --filter @apollo/api test
   ```

---

## 6. Phase 1 Readiness Assessment

With all Phase 0.5 remediation items fully resolved and verified, the architectural baseline for Apollo Restaurant OS is solidified:

- **Security Gate**: Cleared. Multi-tenant database boundary enforced at the PostgreSQL engine level; application role lacks BYPASSRLS permissions.
- **Reliability Gate**: Cleared. Rate limiting is distributed and fail-open to preserve POS availability.
- **Consistency Gate**: Cleared. Monorepo dependencies are unified via `workspace:*` without type duplication.
- **Data Persistence Gate**: Cleared. Migration `20261112200000_init` is committed and reproducible.

**Recommendation:** Proceed to **Phase 1: Core Domain Models & Multi-Tenant Authentication Architecture**.
