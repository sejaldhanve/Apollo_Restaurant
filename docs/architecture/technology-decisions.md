# Technology Decisions & Architectural Rationales

## 1. Frontend: React 19 + Vite + Tailwind CSS

- **Decision**: Adopt React 19 with Vite bundler and Tailwind CSS.
- **Rationale**:
  - Ultra-fast HMR and build performance via Vite.
  - React 19 provides modernized concurrent rendering and action state management.
  - Tailwind CSS enables rapid design token implementation and minimal CSS payload.
  - TanStack Query eliminates redundant network requests with background refetching and cache invalidation.
  - Zustand provides minimal, un-opinionated state management without Redux boilerplate.

## 2. Desktop: Electron with Secure Defaults

- **Decision**: Electron encapsulating the shared web frontend.
- **Rationale**:
  - Provides native hardware access (thermal receipt printers, cash drawers, bar code scanners, scales) required by physical restaurant POS terminals.
  - Strict security posture: `nodeIntegration: false`, `contextIsolation: true`, secure IPC bridges via `preload.js`.

## 3. Backend: Express + TypeScript + Prisma

- **Decision**: Node.js 20+ runtime with Express.js and Prisma ORM.
- **Rationale**:
  - Strong typing across request lifecycle using Zod.
  - Native asynchronous event loop matches high-throughput I/O POS operations.
  - Prisma generates type-safe database queries synchronized with relational schemas.
  - Socket.IO powers sub-100ms real-time kitchen ticket and floor state broadcasts.

## 4. AI Services: Python + LangGraph + Pydantic

- **Decision**: Dedicated Python microservice running LangGraph.
- **Rationale**:
  - LangGraph provides stateful multi-actor agent orchestration, cyclic graphs, and human-in-the-loop checkpoints.
  - Python ecosystem provides first-class support for LLM providers (OpenAI, Gemini, Ollama) and vector embeddings.
  - Strict input/output validation guaranteed through Pydantic v2 schemas.

## 5. Polyglot Persistence: PostgreSQL, Neo4j, Qdrant, Redis

- **Decision**: Polyglot persistence instead of monolithic database.
- **Rationale**:
  - **PostgreSQL**: Industry gold standard for ACID financial and order ledger consistency.
  - **Neo4j**: Native graph traversals for customer journey, allergen supply chains, and agent action provenance.
  - **Qdrant**: High-performance semantic similarity for natural language menu queries and agent SOP RAG.
  - **Redis**: Low-latency caching, token revocations, and station distributed locks.
