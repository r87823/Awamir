# Docker Production Deployment

This guide runs Awamir Plus backend for staging/production with Docker Compose.

Architecture remains:

```text
Flutter App -> Awamir Plus Backend -> ERPNext REST API
```

Flutter never receives ERPNext URLs or credentials. ERPNext credentials live only in backend environment files or the deployment secret manager.

## Services

`docker-compose.prod.yml` starts:
- `api`: NestJS HTTP API. `ERPNEXT_WORKER_ENABLED=false`.
- `worker`: ERPNext sync worker. `ERPNEXT_WORKER_ENABLED=true`; no HTTP server.
- `postgres`: PostgreSQL with persistent volume.
- `redis`: Redis with persistent volume.

## Environment Setup

Copy the staging template and replace all placeholders:

```bash
cp .env.staging.example .env.staging
```

Required variables:
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_SECRET`
- `ERPNEXT_BASE_URL`
- `ERPNEXT_API_KEY`
- `ERPNEXT_API_SECRET`
- `ERPNEXT_COMPANY`

Database container variables:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

ERPNext mapping variables for document sync:
- `ERPNEXT_DEFAULT_WAREHOUSE`
- `ERPNEXT_RECEIVABLE_ACCOUNT`
- `ERPNEXT_INCOME_ACCOUNT`
- payment account variables matching enabled payment methods.

Do not commit `.env.staging` or any real secret file.

## Build

Build the API image:

```bash
pnpm docker:build
```

Build the worker image:

```bash
pnpm docker:worker:build
```

Both commands use `apps/api/Dockerfile`. The API and worker targets share the same compiled application and generated Prisma client.

## Migrations

Production uses Prisma migrate deploy:

```bash
docker compose --env-file .env.staging -f docker-compose.prod.yml run --rm api pnpm prisma:migrate:deploy
```

Run migrations before starting a new application version or during a controlled deployment window. Do not run `prisma migrate dev` in staging or production.

## Start

Start all services:

```bash
pnpm docker:prod:up
```

Stop services:

```bash
pnpm docker:prod:down
```

## Health Checks

API liveness:

```bash
curl http://localhost:3000/health/live
```

API readiness:

```bash
curl http://localhost:3000/health/ready
```

Readiness includes database, Redis, worker setting visibility, outbox counts, and optional ERPNext connectivity when `ERPNEXT_HEALTH_ENABLED=true`.

## Logs

API logs:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Worker logs:

```bash
docker compose -f docker-compose.prod.yml logs -f worker
```

PostgreSQL and Redis:

```bash
docker compose -f docker-compose.prod.yml logs -f postgres redis
```

Logs are structured by the backend logger. Secrets, tokens, API keys, and ERPNext API secrets must not appear in logs.

## ERPNext Sync Boundary

ERPNext HTTP calls remain centralized in `ERPNextClient`. The API and worker both use backend env/config only. Payments and Cashboxes remain ERPNext-isolated; accounting and sync services enqueue or process outbox work.

Operational workflows must not depend on ERPNext availability. Failed ERPNext sync writes sync logs and retry/dead-letter state without rolling back Awamir records.

## Rollback Notes

For application rollback:
1. Keep the database volume intact.
2. Deploy the previous known-good API/worker image tags.
3. Restart `api` and `worker`.
4. Check `/health/ready`.
5. Inspect failed or dead-letter ERPNext outbox rows before manual retry.

Database migrations are forward-only. If a rollback requires schema reversal, prepare a reviewed SQL rollback separately and test it against staging data first.
