# Monorepo Structure & Package Boundaries

## 1. Monorepo Organization

Apollo Restaurant OS utilizes a **pnpm workspaces** topology organized into strict responsibility domains.

```
apollo-restaurant/
│
├── apps/                         # User-facing client applications
│   ├── web/                      # React 19 + Vite + Tailwind web client
│   ├── desktop/                  # Electron application (wrapping web client)
│   └── kitchen-display/          # High-durability touch KDS application
│
├── services/                     # Backend and computational services
│   ├── api/                      # Core Express + TypeScript + Prisma API
│   ├── agents/                   # Python + LangGraph + FastAPI Agent Service
│   ├── sync/                     # Offline sync & state reconciliation service
│   └── code-sandbox/             # Isolated runtime for dynamic software generation
│
├── packages/                     # Reusable shared libraries
│   ├── shared-types/             # Cross-cutting TypeScript contracts
│   ├── ui/                       # Shared design system and UI components
│   ├── api-client/               # Type-safe API SDK for clients
│   └── config/                   # Global configuration constants and schemas
│
├── database/                     # Database schemas, seeds, and migrations
│   ├── postgres/                 # PostgreSQL initialization and migrations
│   ├── neo4j/                    # Graph database constraints and schemas
│   └── qdrant/                   # Vector database collection definitions
│
├── infrastructure/               # DevOps and deployment assets
│   ├── docker/                   # Dockerfiles and container configs
│   ├── deployment/               # Cloud PaaS and IaC descriptors
│   └── ci/                       # Continuous integration specifications
│
├── docs/                         # System architecture and domain documentation
│   ├── architecture/
│   ├── requirements/
│   ├── api/
│   ├── database/
│   ├── security/
│   ├── agents/
│   ├── development/
│   └── testing/
│
├── tests/                        # Cross-service end-to-end and integration suites
│   ├── integration/
│   ├── e2e/
│   ├── performance/
│   └── security/
│
├── .github/workflows/            # GitHub Actions CI/CD workflows
├── docker-compose.yml            # Local development orchestration
├── pnpm-workspace.yaml           # Workspace package boundaries
└── tsconfig.base.json            # Base compiler rules
```

## 2. Dependency Rules & Boundaries

- **Apps** may depend on `packages/*`, but apps may NEVER depend on other apps or directly on backend services code.
- **Packages** must be strictly modular, framework-agnostic where possible, and must not create circular inter-package dependencies.
- **Services** must maintain decoupled databases and boundaries. The AI Agent Service communicates with the core API via explicit HTTP/WSS API contracts or event queues, never direct raw database modification.
