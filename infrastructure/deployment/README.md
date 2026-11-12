# Deployment Architecture & Strategy — Apollo Restaurant OS

## Cloud Infrastructure Targets

1. **PaaS Hosting (Render / Railway)**:
   - `web`: Static site or Node SSR hosting.
   - `api`: Containerized Node.js service running `dist/index.js`.
   - `agents`: Containerized Python ASGI service running `uvicorn src.main:app`.
2. **Managed Data Services**:
   - Managed PostgreSQL (AWS RDS / Neon / Supabase / Render Postgres).
   - Managed Redis (Upstash / Redis Cloud / AWS ElastiCache).
   - Qdrant Cloud or self-hosted container instance.
   - Neo4j AuraDB or self-hosted container instance.

## Environment Promotion Stages

- **Local (`development`)**: Local Docker Compose with in-repo services.
- **Preview / PR**: Ephemeral preview environments per pull request.
- **Staging (`staging`)**: Mirror of production topology with sanitized fixture data.
- **Production (`production`)**: Multi-region, automated zero-downtime rolling deployments.

## Zero Secrets in Code

All secrets must be injected through infrastructure runtime secret managers (AWS Secrets Manager, Doppler, or Render Environment Variables).
