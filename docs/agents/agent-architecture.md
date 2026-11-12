# AI Multi-Agent Architecture & Governance

## 1. Multi-Agent Ecosystem Overview

Apollo Restaurant OS utilizes a collaborative multi-agent architecture built on **LangGraph**. The agents operate as specialized workers coordinated by a central **Supervisor Agent**.

```
                        +----------------------+
                        |   Supervisor Agent   |
                        | (Workflow Director)  |
                        +----------+-----------+
                                   |
         +------------+------------+------------+------------+
         |            |            |            |            |
         v            v            v            v            v
    +---------+  +---------+  +---------+  +---------+  +---------+
    | Front of|  |  Order  |  | Kitchen |  |Inventory|  | Finance |
    |  House  |  |  Agent  |  |  Agent  |  |  Agent  |  |  Agent  |
    +---------+  +---------+  +---------+  +---------+  +---------+
         |            |            |            |            |
         +------------+------------+------------+------------+
                                   |
         +------------+------------+------------+------------+
         |            |            |            |            |
         v            v            v            v            v
    +---------+  +---------+  +---------+  +---------+  +---------+
    |Workforce|  | Coding  |  | Testing |  |Security | |Deployment|
    |  Agent  |  |  Agent  |  |  Agent  |  |  Agent  | |  Agent  |
    +---------+  +---------+  +---------+  +---------+  +---------+
```

## 2. Agent Catalog & Domain Responsibilities

1. **Supervisor Agent**: Deconstructs user intent, determines execution plan, delegates to domain specialists, and synthesizes outputs.
2. **Front-of-House (FoH) Agent**: Manages table seating optimization, VIP preferences, reservation pacing, and guest communications.
3. **Order Agent**: Interprets complex conversational orders, validates ingredient modifications and allergen conflicts.
4. **Kitchen Agent**: Optimizes station load balancing, predicts ticket prep times, coordinates fire times.
5. **Inventory Agent**: Tracks consumption velocity, forecasts depletion dates, drafts purchase orders.
6. **Finance Agent**: Reconciles shift payments, detects cash variance anomalies, computes labor cost percentage.
7. **Workforce Agent**: Builds compliant shift schedules based on forecast sales volume and weather signals.
8. **Coding Agent**: Generates custom restaurant plugins, integrations, and reports within an isolated sandbox.
9. **Testing Agent**: Executes automated regression tests against generated code before deployment.
10. **Security Agent**: Audits generated code and workflows for security vulnerabilities and access control violations.
11. **Deployment Agent**: Safely deploys validated plugins and reports behind feature flags.

## 3. Safety, Bounded Retries & Human-in-the-Loop

- **State Serialization**: State graphs persist execution states to enable resume after human intervention.
- **Timeout Bounds**: Every tool call enforces strict 5000ms timeouts with max 2 retries.
- **Audit Trails**: All agent reasoning steps, tool calls, and outputs are logged to Neo4j and structured logs.
