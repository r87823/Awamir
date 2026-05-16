# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/erpnext-mock/package.json apps/erpnext-mock/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @awamir/api prisma:generate
RUN pnpm --filter @awamir/api build
RUN pnpm --filter @awamir/api deploy --legacy --prod /prod/api
RUN cp apps/api/package.json /prod/api/package.json
RUN cd /prod/api && pnpm prisma:generate

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --chown=node:node --from=build /prod/api ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/health/live',timeout:3000},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1);});"

USER node

FROM runtime AS api

ENV ERPNEXT_WORKER_ENABLED=false

CMD ["node", "dist/src/main.js"]

FROM runtime AS worker

ENV ERPNEXT_WORKER_ENABLED=true

HEALTHCHECK NONE

CMD ["node", "dist/src/worker.js"]
