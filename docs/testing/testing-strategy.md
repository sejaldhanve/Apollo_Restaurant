# Testing Strategy & Quality Assurance Framework

## 1. Testing Pyramid

```
                / \
               /   \
              / E2E \       Playwright (Critical Paths)
             /-------\
            / Integr. \     Supertest + Pytest (APIs, DBs, Agents)
           /-----------\
          /    Unit     \   Vitest + React Testing Library + Pytest
         /---------------\
```

## 2. Testing Levels & Tools

### Unit Testing

- **Frontend (`apps/web`)**: Vitest + React Testing Library + jsdom for isolated component and hook verification.
- **Backend (`services/api`)**: Vitest for service logic, utility functions, and Zod schema validations.
- **AI Agents (`services/agents`)**: Pytest for node transitions, prompt formatting, and state transformation logic.

### Integration Testing

- **API Endpoints**: Supertest executing against live test database instances.
- **Agent Graphs**: Pytest executing state graph compilations with mocked LLM tool calls.
- **Multi-Tenancy Isolation**: Explicit automated test assertions ensuring cross-tenant queries fail with 403 Forbidden.

### End-to-End (E2E) Testing

- **Framework**: Playwright executing headless browser journeys:
  1. Login $\rightarrow$ Table Selection $\rightarrow$ Order Entry $\rightarrow$ Kitchen KDS Ticket Render $\rightarrow$ Payment Settlement.
  2. Inventory stock decrement validation following complete order lifecycle.

## 3. Verification Commands

```bash
# Run all monorepo unit tests
pnpm test

# Run TypeScript type check across all workspaces
pnpm run typecheck

# Run linter across all codebases
pnpm run lint

# Run agent tests
cd services/agents && pytest tests/ -v
```
