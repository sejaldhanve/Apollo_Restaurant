# Apollo Restaurant OS — System Overview

## 1. Executive Summary

**Apollo Restaurant OS** is an AI-native, multi-tenant autonomous restaurant operating system engineered for enterprise hospitality groups, franchise operators, and high-volume dining establishments.

Unlike traditional legacy point-of-sale (POS) systems that act as passive data entry registries, Apollo is architected around autonomous, cooperative AI agents executing operational workflows across Front of House (FoH), Kitchen / Back of House (BoH), Inventory & Supply Chain, Workforce, and Finance.

## 2. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                Client Applications                                |
|  +---------------------------+  +--------------------------+  +----------------+  |
|  |     Responsive Web        |  |     Desktop (Electron)   |  | Kitchen Display|  |
|  |   (React 19 + Tailwind)   |  |   (Isolated Renderer)    |  |  System (KDS)   |  |
|  +---------------------------+  +--------------------------+  +----------------+  |
+-----------------------------------------|-----------------------------------------+
                                          | HTTPS / WSS / REST / JSON
                                          v
+-----------------------------------------------------------------------------------+
|                        Core API Gateway & Application Server                      |
|                                 (services/api)                                    |
|   +-----------------------+ +-----------------------+ +-----------------------+   |
|   |  Security & IAM       | | Domain Services (FoH, | | Real-Time Sync Engine |   |
|   |  (Tenant Isolation)   | |  BoH, Inventory, POS) | |     (Socket.IO)       |   |
|   +-----------------------+ +-----------------------+ +-----------------------+   |
+--------------------|----------------------------------------|---------------------+
                     |                                        |
          Internal REST / Tool Invocation            Pub/Sub Events
                     |                                        |
                     v                                        v
+-----------------------------------------+  +--------------------------------------+
|            AI Agent Service             |  |        Distributed Coordination      |
|           (services/agents)             |  |               (Redis 7)              |
|   +----------------------------------+  |  |  - Event Broker & Cache              |
|   | Supervisor & Multi-Agent Graph   |  |  |  - Rate Limiting                     |
|   | (LangGraph + Pydantic + Tools)   |  |  |  - Terminal Distributed Locks        |
|   +----------------------------------+  |  +--------------------------------------+
+--------------------|--------------------+
                     |
                     v
+-----------------------------------------------------------------------------------+
|                            Polyglot Persistence Layer                            |
|  +-----------------------+ +-----------------------+ +-------------------------+  |
|  |  PostgreSQL 16        | |  Neo4j 5              | |  Qdrant 1.13            |  |
|  |  - Operational Ledger | |  - Unified Commerce   | |  - Semantic Retrieval   |  |
|  |  - Transactions       | |    & Event Graph      | |  - Menu & SOP Vectors   |  |
|  |  - Multi-Tenant RDBMS | |  - Event Provenance   | |  - Customer Taste RAG   |  |
|  +-----------------------+ +-----------------------+ +-------------------------+  |
+-----------------------------------------------------------------------------------+
```

## 3. Core Functional Pillars

1. **Front of House (FoH)**: Table layout management, floor assignments, guest reservations, mobile pay-at-table, server handhelds.
2. **Kitchen & Back of House (BoH)**: Kitchen Display System (KDS), intelligent ticket routing, station pacing, cook-time synchronization.
3. **Inventory & Procurement**: Dynamic real-time ingredient deduction (recipe BOMs), automated par-level purchasing, supplier EDI tracking.
4. **Finance & Settlement**: Daily sales reconciliation, automated tip distribution, tax matrix calculation, audit-ready operational ledgers.
5. **Workforce & Shift Management**: Labor forecasting, shift bidding, compliance breaks, clock-in geo-verification.
6. **Autonomous Multi-Agent Swarm**: Specialized domain agents executing real workflows with human-in-the-loop checkpoints.
7. **Offline-First Resilience**: Local caching, client-side queueing, deterministic state conflict resolution upon reconnection.
