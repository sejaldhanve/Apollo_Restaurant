# Continuous Integration & Delivery Architecture

## Workflow Pipelines

The platform uses GitHub Actions (`.github/workflows/ci.yml`) to enforce automated code hygiene, type safety, test execution, and deterministic build validation on every branch and pull request.

## Quality Gates

1. **Format Check**: Prettier style consistency.
2. **Linting**: ESLint strict rules across web and backend; Ruff across Python AI agent service.
3. **Type Checking**: Strict TypeScript compiler (`tsc --noEmit`) with zero implicit any.
4. **Unit & Integration Tests**:
   - Backend unit & route tests (Vitest + Supertest).
   - Frontend component & hook tests (Vitest + React Testing Library).
   - Agent graph and route tests (Pytest).
5. **Deterministic Production Builds**:
   - Web application bundling via Vite.
   - Backend compilation via TypeScript compiler.
