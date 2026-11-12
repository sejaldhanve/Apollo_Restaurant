# Apollo API Server — Multi-Stage Build
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Dependencies Stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @apollo/api...

# Build Stage
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/api/ ./services/api/
RUN pnpm --filter @apollo/api build

# Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apollo
COPY --from=build --chown=apollo:nodejs /app/services/api/dist ./dist
COPY --from=build --chown=apollo:nodejs /app/services/api/package.json ./
COPY --from=build --chown=apollo:nodejs /app/node_modules ./node_modules
USER apollo
EXPOSE 3001
CMD ["node", "dist/index.js"]

