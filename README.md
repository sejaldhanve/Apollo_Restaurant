# Apollo Restaurant OS
> **An AI-Native Autonomous Restaurant Operating System**

Apollo Restaurant OS is a multi-tenant, enterprise-grade restaurant management and autonomous operations platform. Built around specialized cooperative AI agents orchestrated through LangGraph, Apollo drives real operational workflows across Front of House, Kitchen Display Systems, Inventory, Finance, and Workforce management.

---

## Architecture At A Glance

```
apollo-restaurant/
├── apps/                         # Client applications
│   ├── web/                      # React 19 + Vite + Tailwind web dashboard
│   ├── desktop/                  # Electron desktop wrapper (secure defaults)
│   └── kitchen-display/          # Real-time Kitchen Display System (KDS)
│
├── services/                     # Backend and intelligence microservices
│   ├── api/                      # Node.js + Express + Prisma + Socket.IO core API
│   ├── agents/                   # Python + LangGraph + Pydantic AI agent service
│   ├── sync/                     # Offline synchronization engine
│   └── code-sandbox/             # Secure containerized plugin execution sandbox
│
├── packages/                     # Shared monorepo packages
│   ├── shared-types/             # Cross-cutting TypeScript interfaces & schemas
│   ├── ui/                       # Shared design system components
│   ├── api-client/               # Type-safe client API library
│   └── config/                   # Shared system constants & environment schemas
│
├── database/                     # Polyglot database configurations & migrations
│   ├── postgres/                 # PostgreSQL transactional schemas & migrations
│   ├── neo4j/                    # Unified Commerce & Event Graph constraints
│   ├── qdrant/                   # Vector database collections (menu, SOP RAG)
│   └── redis/                    # Caching, queues & distributed locks
│
├── infrastructure/               # DevOps and deployment
│   ├── docker/                   # Multi-stage production Dockerfiles
│   ├── deployment/               # Cloud PaaS target configurations (Render)
│   └── ci/                       # GitHub Actions CI pipeline definitions
│
├── docs/                         # Architectural and operational documentation
│   ├── architecture/             # System overview, monorepo structure, ADRs
│   ├── requirements/             # Traceability matrix
│   ├── api/                      # REST & WebSocket API standards
│   ├── security/                 # Multi-tenancy isolation & AI safety principles
│   ├── agents/                   # Multi-agent graph & governance
│   ├── development/              # Local setup guide
│   └── testing/                  # Testing strategy & coverage guidelines
│
├── docker-compose.yml            # Local development persistence infrastructure
└── pnpm-workspace.yaml           # Monorepo workspace configuration
```

---

## Technology Stack

| Layer | Technologies |
|:---|:---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Zustand, React Hook Form, Zod |
| **Desktop** | Electron with context isolation, disabled Node integration, secure preload IPC |
| **Backend API** | Node.js 20+, Express.js, TypeScript, Prisma ORM, Socket.IO, Zod, Pino, Swagger/OpenAPI |
| **AI Agent Service** | Python 3.12, LangGraph, Pydantic v2, FastAPI, Structlog, LangChain (OpenAI / Gemini / Ollama) |
| **Transactional DB** | PostgreSQL 16 (Multi-tenant relational ledger) |
| **Event & Commerce Graph** | Neo4j 5 (Customer journey, event causality, allergen trace network) |
| **Vector DB** | Qdrant v1.13 (Menu semantics, operational SOP retrieval) |
| **Cache & Realtime** | Redis 7 (Distributed locking, station pub/sub, rate limiting) |
| **Testing** | Vitest, React Testing Library, Supertest, Pytest, Playwright |

---

## Getting Started

### 1. Prerequisites
- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0` (v12.18.0 configured)
- **Python**: `>= 3.11` (Python 3.12 recommended)
- **Docker & Docker Compose**: For local databases

### 2. Environment Setup
```bash
# Copy root environment variables
cp .env.example .env
```

### 3. Install Monorepo Dependencies
```bash
pnpm install
```

### 4. Start Persistence Engines (Docker)
```bash
docker compose up -d
```
Starts PostgreSQL (port 5432), Neo4j (ports 7474, 7687), Qdrant (port 6333), and Redis (port 6379).

### 5. Run the Core API Server
```bash
pnpm --filter @apollo/api dev
```
- Server: `http://localhost:3001`
- Health check: `http://localhost:3001/api/v1/health`
- Swagger UI: `http://localhost:3001/api-docs`

### 6. Run the AI Agent Service
```bash
cd services/agents
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8000
```
- Agent Service: `http://localhost:8000`
- Health check: `http://localhost:8000/health/`
- Interactive docs: `http://localhost:8000/docs`

### 7. Run the Web Application
```bash
pnpm --filter @apollo/web dev
```
- Web Application: `http://localhost:5173`

---

## Quality Verification Commands

```bash
# Build all packages and applications
pnpm run build

# Run TypeScript strict typecheck across all workspaces
pnpm run typecheck

# Run ESLint across TypeScript projects
pnpm run lint

# Check code formatting with Prettier
pnpm run format:check

# Run Node.js test suites (Vitest + Supertest)
pnpm test

# Run Python agent test suite (Pytest)
cd services/agents && pytest tests/ -v

# Run Python code hygiene (Ruff)
cd services/agents && ruff check src tests
```

---

## Documentation

Full architectural documentation is available in [`docs/`](file:///c:/wildcatter_project/docs):
- [System Overview](file:///c:/wildcatter_project/docs/architecture/system-overview.md)
- [Monorepo Structure](file:///c:/wildcatter_project/docs/architecture/monorepo-structure.md)
- [Technology Decisions](file:///c:/wildcatter_project/docs/architecture/technology-decisions.md)
- [Requirements Traceability](file:///c:/wildcatter_project/docs/requirements/requirements-traceability.md)
- [API Standards](file:///c:/wildcatter_project/docs/api/api-standards.md)
- [Security Principles](file:///c:/wildcatter_project/docs/security/security-principles.md)
- [AI Multi-Agent Architecture](file:///c:/wildcatter_project/docs/agents/agent-architecture.md)
- [Local Setup Guide](file:///c:/wildcatter_project/docs/development/local-setup.md)
- [Testing Strategy](file:///c:/wildcatter_project/docs/testing/testing-strategy.md)
