# PostgreSQL — Apollo Restaurant OS

## Architectural Role

PostgreSQL acts as the primary relational data store for Apollo Restaurant OS, responsible for all ACID-compliant transactional state and core system records.

## Data Domains Managed

- **Multi-Tenancy Hierarchy**: Organizations, locations, station terminals, brand configuration.
- **Identity & Access Management (IAM)**: Users, roles, granular capability permissions, audit logs.
- **Catalog Management**: Menu categories, items, modifier groups, pricing schedules, tax groups.
- **Order Lifecycle & Transactions**: Orders, line items, order states, tickets, split bills.
- **Financial Transactions**: Payments, settlement records, tips, refunds, cash drawer logs.
- **Inventory & Recipes**: Master ingredient catalog, bills of materials (BOM), real-time stock levels, purchase orders.
- **Workforce Management**: Employees, shift rosters, clock-in/out logs, wage tiers.

## Schema Management & Migrations

The relational schema is maintained declaratively using **Prisma ORM** within `services/api/prisma/schema.prisma`.

- Development migrations: `pnpm --filter @apollo/api prisma migrate dev`
- Production migrations: `pnpm --filter @apollo/api prisma migrate deploy`
- Client generation: `pnpm --filter @apollo/api prisma generate`

## Local Development

- Container image: `postgres:16-alpine`
- Default dev port: `5432`
- Persistent data: `docker-data/postgres`
- Health check: `pg_isready -U apollo`
