# Local Development Setup Guide

## 1. Prerequisites

- **Node.js**: v20.20.0 or higher
- **pnpm**: v12.18.0 or higher (`npm install -g pnpm`)
- **Python**: v3.12 or higher with `venv`
- **Docker & Docker Compose**: For local databases (PostgreSQL, Neo4j, Qdrant, Redis)
- **Git**: v2.40 or higher

## 2. Environment Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Ensure database credentials and port numbers match your local environment.

## 3. Monorepo Installation

Install all Node.js workspace dependencies:

```bash
pnpm install
```

## 4. Starting Database Infrastructure

Start all core persistence engines via Docker Compose:

```bash
docker compose up -d
```

Verify all 4 database containers are healthy:

- PostgreSQL: `localhost:5432`
- Neo4j: `localhost:7474` (Browser) / `localhost:7687` (Bolt)
- Qdrant: `localhost:6333` (REST) / `localhost:6334` (gRPC)
- Redis: `localhost:6379`

## 5. Running the Backend API

```bash
# In services/api/
pnpm --filter @apollo/api dev
```

The API server will start on `http://localhost:3001`.

- Health check: `http://localhost:3001/api/v1/health`
- Swagger Docs: `http://localhost:3001/api-docs`

## 6. Running the AI Agent Service

```bash
cd services/agents
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8000
```

- Health check: `http://localhost:8000/health/`
- API docs: `http://localhost:8000/docs`

## 7. Running the Web Frontend

```bash
# In apps/web/
pnpm --filter @apollo/web dev
```

The frontend application will start on `http://localhost:5173`.
