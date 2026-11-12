# Requirements Traceability Matrix

## 1. Operational Capability Mapping

| ID         | Operational Capability          | Architectural Module                    | Storage Engine                | Implementation Status               |
| :--------- | :------------------------------ | :-------------------------------------- | :---------------------------- | :---------------------------------- |
| **REQ-01** | Front of House (FoH) Management | `apps/web`, `services/api`              | PostgreSQL, Redis             | Phase 0: Scaffolding Complete       |
| **REQ-02** | Kitchen Display System (BoH)    | `apps/kitchen-display`, `services/api`  | PostgreSQL, Redis (Socket.IO) | Phase 0: Scaffolding Complete       |
| **REQ-03** | Inventory & Recipe BOMs         | `services/api`                          | PostgreSQL                    | Phase 0: Scaffolding Complete       |
| **REQ-04** | Finance, Tips & Settlement      | `services/api`                          | PostgreSQL                    | Phase 0: Scaffolding Complete       |
| **REQ-05** | Workforce & Shift Scheduling    | `services/api`                          | PostgreSQL                    | Phase 0: Scaffolding Complete       |
| **REQ-06** | Autonomous AI Agent Swarm       | `services/agents`                       | Qdrant, Neo4j                 | Phase 0: LangGraph Base Initialized |
| **REQ-07** | Software Generation Sandbox     | `services/code-sandbox`                 | Ephemeral Containers          | Phase 0: Architectural Plan Ready   |
| **REQ-08** | Offline-First Operation         | `packages/api-client`, SQLite/IndexedDB | Local Storage                 | Phase 0: Architectural Plan Ready   |
| **REQ-09** | Public Developer APIs           | `services/api` (/api/v1)                | PostgreSQL                    | Phase 0: OpenAPI & Versioning Ready |
| **REQ-10** | Desktop & Cross-Platform POS    | `apps/desktop`, `apps/web`              | Local SQLite, Web Cache       | Phase 0: Core Web Ready             |

## 2. Traceability from Requirements to Phase 0 Artifacts

- **Multi-Tenancy**: Base entity model in `packages/shared-types/src/index.ts`.
- **Validation**: Zod schema middleware in `services/api/src/middleware/validate.ts`.
- **AI Safety**: Base state and bounded retries in `services/agents/src/agents/base.py`.
- **Health & Observability**: Structured JSON logging (Pino/Structlog) and `/api/v1/health` endpoints.
