# Neo4j — Apollo Restaurant OS (Unified Commerce & Event Graph)

## Architectural Role

Neo4j powers the **Unified Commerce & Event Graph** of Apollo Restaurant OS. While PostgreSQL handles atomic row transactions, Neo4j models high-dimensional connected domain relationships and temporal event causality.

## Graph Models & Use Cases

1. **Dynamic Customer Journey & Experience Graphs**:
   - Tracking touchpoints across physical kiosk, QR code, mobile order, POS, and online delivery.
   - Historical item affinity and taste profiling across multi-visit journeys.
2. **Event Causality & Incident Provenance**:
   - Linking order placement $\rightarrow$ kitchen station routing $\rightarrow$ bump times $\rightarrow$ delivery handoff.
   - Diagnosing kitchen bottlenecks, ticket latency spikes, and modifier failure cascades.
3. **Supply Chain Dependency Networks**:
   - Mapping ingredient batches $\rightarrow$ dish assemblies $\rightarrow$ guest consumption (enabling rapid allergen tracing and contamination recall isolation).
4. **Agent Action Provenance**:
   - Multi-agent collaboration trails (e.g. FOH agent $\rightarrow$ Order agent $\rightarrow$ Kitchen agent $\rightarrow$ Inventory alert) stored as directed acyclic causal graphs.

## Cypher Schema Constraints

Initial schema constraints and uniqueness indexes are defined in `database/neo4j/constraints/init-constraints.cypher`.

## Local Development

- Container image: `neo4j:5-community`
- Browser UI: `http://localhost:7474`
- Bolt protocol: `bolt://localhost:7687`
- Persistent storage: `docker-data/neo4j`
