# syntax=docker/dockerfile:1.7
# PeopleForge — API image. Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile \
#     --secret id=npmrc,src=$HOME/.sirius-registry.npmrc \
#     -t peopleforge-api:<git-sha> .
# @sirius/* packages come from the private registry (SIRIUS_REGISTRY, default: Verdaccio on the
# host). The registry token is a BuildKit secret: it is never written to an image layer.
# Pin the base image by digest in the registry mirror once hosting is approved (ADR-001).

ARG NODE_IMAGE=node:22.22-alpine3.22
ARG SIRIUS_REGISTRY=http://host.docker.internal:4873/

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
RUN pnpm dlx turbo@2.11.7 prune @peopleforge/api --docker

# 2. Install (lockfile only), build, then produce a production-only deployable folder.
FROM base AS build
ARG SIRIUS_REGISTRY
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN sed -i "s#^@sirius:registry=.*#@sirius:registry=${SIRIUS_REGISTRY}#" .npmrc
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@peopleforge/api \
 && pnpm --filter=@peopleforge/api deploy --prod --legacy /out/api

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
