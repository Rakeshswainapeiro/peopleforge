# syntax=docker/dockerfile:1.7
# PeopleForge — web image (Next.js standalone). Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile \
#     --secret id=npmrc,src=$HOME/.sirius-registry.npmrc \
#     -t peopleforge-web:<git-sha> .
# @sirius/* packages come from the private registry (SIRIUS_REGISTRY, default: Verdaccio on the
# host). The registry token is a BuildKit secret: it is never written to an image layer.
# Pin the base image by digest in the registry mirror once hosting is approved (ADR-001).

ARG NODE_IMAGE=node:22.22-alpine3.22
ARG SIRIUS_REGISTRY=http://host.docker.internal:4873/

FROM ${NODE_IMAGE} AS base
# Next.js and Turborepo telemetry send data to a third party outside the approved region.
ENV PNPM_HOME=/pnpm \
    HUSKY=0 \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS prune
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.7 prune @peopleforge/web --docker

FROM base AS build
ARG SIRIUS_REGISTRY
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN sed -i "s#^@sirius:registry=.*#@sirius:registry=${SIRIUS_REGISTRY}#" .npmrc
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@peopleforge/web

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
