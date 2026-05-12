# R20-T01 Docker Production Setup

## Purpose / Big Picture

Prepare Awamir Plus for staging/production deployment with Docker. The backend API and ERPNext sync worker will run as separate containers using the same built application image, with PostgreSQL and Redis provided by production compose. Migrations are run explicitly with `prisma migrate deploy`; no development migrations run in production.

## Scope

Included:
- Production API Dockerfile.
- Separate worker runtime target/command.
- `docker-compose.prod.yml` with API, worker, PostgreSQL, and Redis.
- Production/staging env examples without secrets.
- Deployment scripts and migration deploy script.
- Docker production documentation.

Excluded:
- Business logic changes.
- Flutter behavior changes.
- ERPNext boundary changes.
- CI workflow rewrites.
- Committed secrets.

## Files Expected To Change

- `apps/api/Dockerfile`
- `apps/api/src/worker.ts`
- `apps/api/package.json`
- `package.json`
- `docker-compose.prod.yml`
- `.dockerignore`
- `.env.example`
- `.env.staging.example`
- `docs/deployment/docker-production.md`
- `docs/plans/R20-T01-docker-production-setup.md`

## Data Model Changes

None.

## API Changes

None.

## State Transitions

None.

## Authorization

No authorization changes.

## Idempotency

No idempotency changes. Existing outbox and ERPNext sync idempotency remain unchanged.

## Audit Logs

No audit log changes.

## Tests

Verification:
- Docker API image build.
- Docker worker target/command build.
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`

## Acceptance Criteria

- [x] `docker-compose.prod.yml` exists.
- [x] API image builds.
- [x] Worker image/target builds.
- [x] Production env examples exist without secrets.
- [x] Production migration command exists.
- [x] Deployment docs exist.
- [x] No secrets committed.
- [x] Existing CI remains green.

## Progress

- [x] Step 1: Read AGENTS.md, PLANS.md, package scripts, and worker implementation.
- [x] Step 2: Add worker entrypoint and production Dockerfile.
- [x] Step 3: Add compose, env examples, and scripts.
- [x] Step 4: Add deployment docs.
- [x] Step 5: Build/verify Docker and run required checks.

## Surprises & Discoveries

- The ERPNext worker is already gated by `ERPNEXT_WORKER_ENABLED=true`, but the current only runtime command starts the HTTP API. R20 needs a separate worker entrypoint so the worker container does not expose or run the API server.
- Production compose should not provide fallback secrets. `docker-compose.prod.yml` now requires sensitive values through `.env.staging`/deployment env instead of committing usable defaults.

## Decision Log

- Use one API Dockerfile with production targets and separate commands for API and worker.
- API container defaults `ERPNEXT_WORKER_ENABLED=false`.
- Worker container sets `ERPNEXT_WORKER_ENABLED=true` and runs a Nest application context instead of `main.ts`.
- Keep migrations as an explicit `prisma migrate deploy` command rather than running them automatically on API boot.

## Outcome

Implemented. Awamir Plus now has a production API Dockerfile with separate `api` and `worker` targets, explicit deployment migration command, production compose with health checks and persistent PostgreSQL/Redis volumes, staging/local env examples, and Docker production documentation. The worker runs a Nest application context with `ERPNEXT_WORKER_ENABLED=true`; the API target defaults the worker off.

Verification completed:
- `docker build -f apps/api/Dockerfile --target api -t awamir-plus-api:r20 .`
- `docker build -f apps/api/Dockerfile --target worker -t awamir-plus-worker:r20 .`
- `docker compose --env-file .env.staging.example -f docker-compose.prod.yml config`
- Docker image inspection confirmed no `.env` files are present.
- Secret scan found no committed concrete secret values in the new env examples.
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
