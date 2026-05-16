# R21 Staging Deployment From Registry Images

This runbook deploys Awamir Plus staging on `root@46.202.154.140` using production-like immutable Docker images.

Staging public API domain:

```text
https://api-staging.r8787m.cc
```

Flutter connects only to Awamir Plus Backend. ERPNext staging credentials stay in the server-only `.env.staging` file.

## Image Strategy

Registry: GitHub Container Registry.

Images:

```text
ghcr.io/r87823/awamir-plus-api
ghcr.io/r87823/awamir-plus-worker
```

Tags:

- `sha-<12-char-git-sha>`: immutable deployment and rollback tag.
- `staging`: mutable convenience tag for the latest develop/staging image.
- `vX.Y.Z`: release tag when a git version tag is pushed.
- rollback tag: use the previous `sha-<12-char-git-sha>` recorded in `.env.staging`; do not rely on rebuilding local code.

Recommended staging pinning:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-<known-good-sha>
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-<known-good-sha>
```

The `staging` tag is useful for quick drills, but pinned SHA tags are safer and auditable.

## Publish Images

GitHub Actions workflow:

```text
.github/workflows/docker-images.yml
```

It builds and pushes:

- API target from `apps/api/Dockerfile`
- worker target from `apps/api/Dockerfile`
- `sha-<short-sha>` tags
- `staging` tags on `develop`
- version tags on `v*` git tags

Manual fallback from a trusted machine:

```bash
export RELEASE_SHA="$(git rev-parse --short=12 HEAD)"
export REGISTRY="ghcr.io/r87823"

docker login ghcr.io

docker build -f apps/api/Dockerfile --target api \
  -t "${REGISTRY}/awamir-plus-api:sha-${RELEASE_SHA}" \
  -t "${REGISTRY}/awamir-plus-api:staging" .

docker build -f apps/api/Dockerfile --target worker \
  -t "${REGISTRY}/awamir-plus-worker:sha-${RELEASE_SHA}" \
  -t "${REGISTRY}/awamir-plus-worker:staging" .

docker push "${REGISTRY}/awamir-plus-api:sha-${RELEASE_SHA}"
docker push "${REGISTRY}/awamir-plus-api:staging"
docker push "${REGISTRY}/awamir-plus-worker:sha-${RELEASE_SHA}"
docker push "${REGISTRY}/awamir-plus-worker:staging"
```

Do not push images from a dirty worktree.

## Server Directory

SSH to the server:

```bash
ssh root@46.202.154.140
```

Use the existing staging directory:

```bash
cd /opt/awamir-plus-staging
```

The directory should contain deployment files only:

- `docker-compose.prod.yml`
- `docker-compose.staging.yml`
- `ops/caddy/Caddyfile` if Caddy is used
- `.env.staging`

The current staging server path is not a git repo. That is acceptable for R21 if images are pulled from the registry and Compose files are copied deliberately during deploy. Do not copy application source to the server for normal staging deploys.

## Environment

`.env.staging` is server-only and untracked.

Required image variables:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-<known-good-sha>
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-<known-good-sha>
DOCKER_PULL_POLICY=always
```

Required staging runtime variables:

```text
NODE_ENV=staging
PORT=3000
STAGING_API_DOMAIN=api-staging.r8787m.cc
CADDY_EMAIL=<ops-email>
API_BIND_ADDRESS=127.0.0.1

POSTGRES_DB=awamir_plus
POSTGRES_USER=awamir
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://awamir:<strong-password>@postgres:5432/awamir_plus?schema=public
REDIS_URL=redis://redis:6379/0
AUTH_JWT_SECRET=<long-random-secret>

ERPNEXT_BASE_URL=<erpnext-staging-url>
ERPNEXT_API_KEY=<erpnext-staging-api-key>
ERPNEXT_API_SECRET=<erpnext-staging-api-secret>
ERPNEXT_COMPANY=<erpnext-staging-company>
ERPNEXT_HEALTH_ENABLED=true
```

Also set the ERPNext customer, warehouse, receivable, income, and payment account mapping variables required by R19.

Never print or commit `.env.staging`.

## First Staging Deploy From Images

Use these commands inside `/opt/awamir-plus-staging`.

Validate Compose:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  config
```

Pull API and worker images:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  pull api worker
```

Start persistent services without removing volumes:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up -d postgres redis
```

Run migrations explicitly:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  run --rm api ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Start API, worker, and staging reverse proxy:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up -d --no-build api worker caddy
```

If the server uses Nginx Proxy Manager instead of Caddy, omit `docker-compose.staging.yml` or do not start `caddy`; keep the existing proxy host pointing to `127.0.0.1:3000`.

## Update Staging To New Image Tags

Edit only image tags in `.env.staging`:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-<new-sha>
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-<new-sha>
```

Deploy:

```bash
cd /opt/awamir-plus-staging

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  config

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  pull api worker

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  run --rm api ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up -d --no-build --no-deps api worker
```

Do not run `docker compose down -v`. Do not remove Postgres or Redis volumes.

## Rollback

Restore previous image tags in `.env.staging`:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-<previous-good-sha>
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-<previous-good-sha>
```

Then:

```bash
cd /opt/awamir-plus-staging

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  pull api worker

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up -d --no-build --no-deps api worker

curl -fsS https://api-staging.r8787m.cc/health/ready
```

Do not roll back database migrations without a reviewed rollback script.

## Logs And Health

Container status:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  ps
```

API logs:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  logs --tail 200 api
```

Worker logs:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  logs --tail 200 worker
```

Worker status:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  ps worker
```

Public health checks:

```bash
curl -fsS https://api-staging.r8787m.cc/health/live
curl -fsS https://api-staging.r8787m.cc/health/ready
```

## ERPNext Smoke After Deploy

Run inside `/opt/awamir-plus-staging` without printing secrets:

```bash
read -s AWAMIR_VERIFY_PASSWORD
export AWAMIR_VERIFY_PASSWORD

docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  exec \
  -e AWAMIR_API_BASE_URL=https://api-staging.r8787m.cc \
  -e AWAMIR_VERIFY_USERNAME=admin \
  -e AWAMIR_VERIFY_PASSWORD \
  -e AWAMIR_VERIFY_BRANCH_CODE=RIYADH \
  -e AWAMIR_VERIFY_PRODUCT_CODE=FATAYER_SPINACH \
  -e AWAMIR_VERIFY_PAYMENT_METHOD=CASH \
  -e AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP=true \
  api node dist/src/scripts/verify-erpnext-staging.js

unset AWAMIR_VERIFY_PASSWORD
```

Expected R19-known behavior:

- Sales Order and Sales Invoice should process automatically through the worker.
- Payment Entry should reach the worker automatically.
- A Payment Entry `duplicate_document` result is a known ERPNext staging/idempotency follow-up, not a worker wakeup failure.

## Safety Checks

- `.env.staging` remains untracked and `chmod 600`.
- No command prints ERPNext API secrets, JWTs, database URLs, or passwords.
- No command removes volumes.
- Migrations are run explicitly with `prisma:migrate:deploy`.
- API and worker use the same image SHA family.
- API has `ERPNEXT_WORKER_ENABLED=false`; worker has `ERPNEXT_WORKER_ENABLED=true`.
- Flutter continues to call only `https://api-staging.r8787m.cc`.
