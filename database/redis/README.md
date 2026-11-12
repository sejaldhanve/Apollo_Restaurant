# Redis — Apollo Restaurant OS (Cache, Queue & Distributed Coordination)

## Architectural Role

Redis provides ultra-low latency in-memory data structures for cross-service caching, real-time pub/sub synchronization, rate limiting, and ephemeral session state.

## Core Usages

1. **Real-time Pub/Sub Broker**:
   - Emits kitchen bump bar events, order status updates, and table occupancy changes to connected Socket.IO instances.
2. **Session and Token Cache**:
   - Ephemeral storage for JWT blacklist tokens, temporary station sign-in pins, and POS terminal lock states.
3. **API Rate Limiting**:
   - Sliding-window rate limiters protecting public developer endpoints and agent invocation routes.
4. **Distributed Lock Manager**:
   - Redlock-based concurrency control preventing duplicate inventory allocations or concurrent table assignments.
5. **Agent Task Queue**:
   - Light queue for background agent tasks and async webhooks.

## Local Development

- Container image: `redis:7-alpine`
- Port: `6379`
- Persistent storage: `docker-data/redis`
- Health check: `redis-cli ping`
