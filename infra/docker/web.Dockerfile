# syntax=docker/dockerfile:1.7
# Sirius HR — web image (Next.js standalone). Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t sirius-hr-web:<git-sha> .
# Pin the base image by digest in the registry mirror once hosting is approved (ADR-001).

ARG NODE_IMAGE=node:22.22-alpine3.22

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
RUN pnpm dlx turbo@2.11.7 prune @sirius-hr/web --docker

FROM base AS build
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@sirius-hr/web

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
