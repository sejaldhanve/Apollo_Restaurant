// Apollo Restaurant OS — Neo4j Constraints & Schema Indices
// Run after Neo4j container initializes to enforce entity uniqueness and index lookups.

// --- Uniqueness Constraints ---
CREATE CONSTRAINT org_id_unique IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT location_id_unique IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT customer_id_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT order_id_unique IF NOT EXISTS FOR (o:Order) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT menu_item_id_unique IF NOT EXISTS FOR (m:MenuItem) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT employee_id_unique IF NOT EXISTS FOR (e:Employee) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT agent_run_id_unique IF NOT EXISTS FOR (a:AgentRun) REQUIRE a.id IS UNIQUE;

// --- Performance Indices ---
CREATE INDEX order_timestamp_idx IF NOT EXISTS FOR (o:Order) ON (o.timestamp);
CREATE INDEX event_type_idx IF NOT EXISTS FOR (e:DomainEvent) ON (e.type);

