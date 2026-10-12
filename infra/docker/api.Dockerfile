# syntax=docker/dockerfile:1.7
# Sirius HR — API image. Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile -t sirius-hr-api:<git-sha> .
# Pin the base image by digest in the registry mirror once hosting is approved (ADR-001).

ARG NODE_IMAGE=node:22.22-alpine3.22

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    HUSKY=0 \
    PATH=/pnpm:$PATH \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# 1. Reduce the monorepo to the API and its workspace dependencies.
FROM base AS prune
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.7 prune @sirius-hr/api --docker

# 2. Install (lockfile only), build, then produce a production-only deployable folder.
FROM base AS build
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@sirius-hr/api \
 && pnpm --filter=@sirius-hr/api deploy --prod --legacy /out/api

# 3. Minimal runtime: no package manager, no build tools, non-root.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out/api/package.json ./package.json
COPY --from=build --chown=node:node /out/api/node_modules ./node_modules
COPY --from=build --chown=node:node /out/api/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/health/live || exit 1
# Node handles SIGTERM itself (graceful shutdown in src/lifecycle/shutdown.ts).
CMD ["node", "dist/main.js"]
