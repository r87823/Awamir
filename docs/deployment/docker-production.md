# Docker Production Deployment

This guide runs Awamir Plus backend in a production-grade Docker Compose setup.

The architecture remains:

```text
Flutter App -> Awamir Plus Backend -> ERPNext REST API
```

Flutter never receives ERPNext URLs, API keys, API secrets, tokens, SDKs, or direct ERPNext document endpoints. ERPNext credentials live only in backend environment files or a deployment secret manager.

## Architecture Decision

Recommended production deployment strategy: Docker registry/image deployment.

Why:

- Production hosts should run immutable image tags, not build from a mutable working tree.
- Rollback is faster: change `AWAMIR_API_IMAGE` and `AWAMIR_WORKER_IMAGE` back to a known-good tag, then recreate only API/worker.
- The production host does not need the full git repository, Node build cache, Flutter tooling, or source history.
- CI can run tests, build images once, push signed/tagged images, and production only pulls those images.

Tradeoffs:

- Requires a registry and release tagging discipline.
- Requires one extra promotion step from staging-tested image to production tag.
- Local build fallback still exists for emergency or small single-host deployments, but it should not be the normal production path.

Alternative deployment modes:

- Git-based deployment is simple, but risks unreviewed host-local state and slower rollback.
- Artifact tarball deployment works without a registry, but is easier to drift and harder to audit than image tags.

## Services

`docker-compose.prod.yml` starts:

- `api`: NestJS HTTP API with `ERPNEXT_WORKER_ENABLED=false`.
- `worker`: ERPNext sync worker with `ERPNEXT_WORKER_ENABLED=true`; no public HTTP port.
- `postgres`: PostgreSQL 16 with persistent volume.
- `redis`: Redis 7 with AOF persistence.

Only the API is bound to the host. By default it binds to `127.0.0.1:${PORT}` so a host reverse proxy or load balancer can terminate TLS. Set `API_BIND_ADDRESS=0.0.0.0` only when the host firewall or private load balancer restricts access.

A public `0.0.0.0:3000` API bind is not production-ready unless port `3000` is blocked from the public internet. Public HTTPS should terminate on the reverse proxy or load balancer, not directly on the NestJS container port.

Postgres and Redis are internal Compose services and must not be exposed publicly.

## Environment

Create production env on the production host:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill every placeholder. Do not commit `.env.production`.

Required groups:

- Database: `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Redis: `REDIS_URL`
- Auth: `AUTH_JWT_SECRET`, `AUTH_REFRESH_TOKEN_TTL_DAYS`
- ERPNext: `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, `ERPNEXT_COMPANY`
- ERPNext mapping: warehouse, income, receivable, and payment accounts
- Runtime: `NODE_ENV=production`, `PORT`, `API_BIND_ADDRESS`
- Images: `AWAMIR_API_IMAGE`, `AWAMIR_WORKER_IMAGE`

Secrets must come from the host env file or a secret manager. Never place ERPNext credentials in Flutter.

Security env requirements:

- `AUTH_JWT_SECRET` must be unique, random, and at least 32 characters in staging/production.
- `AUTH_JWT_EXPIRES_IN_SECONDS` should be `900` to `3600` in production.
- `CORS_ALLOWED_ORIGINS` must be explicit; do not use `*` in production.
- `CORS_ORIGINS` is kept only as a backward-compatible alias.
- `CORS_CREDENTIALS=false` unless cookie auth is intentionally added.

## Image Tagging

Use immutable tags:

```text
registry.example.com/awamir-plus/api:2026-05-16-a5d9370
registry.example.com/awamir-plus/worker:2026-05-16-a5d9370
```

Build and push from CI or a trusted build machine:

```bash
docker build -f apps/api/Dockerfile --target api \
  -t registry.example.com/awamir-plus/api:${RELEASE_TAG} .

docker build -f apps/api/Dockerfile --target worker \
  -t registry.example.com/awamir-plus/worker:${RELEASE_TAG} .

docker push registry.example.com/awamir-plus/api:${RELEASE_TAG}
docker push registry.example.com/awamir-plus/worker:${RELEASE_TAG}
```

Update `.env.production`:

```text
AWAMIR_API_IMAGE=registry.example.com/awamir-plus/api:<release-tag>
AWAMIR_WORKER_IMAGE=registry.example.com/awamir-plus/worker:<release-tag>
```

## First Deploy

On the production host:

```bash
mkdir -p /opt/awamir-plus
cd /opt/awamir-plus
```

Place these deployment files in the directory:

- `docker-compose.prod.yml`
- `.env.production`

Validate the rendered Compose config:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Pull images:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker
```

Start database and Redis first:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
```

Run migrations:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Start API and worker:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d api worker
```

Verify:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:${PORT:-3000}/health/live
curl -fsS http://127.0.0.1:${PORT:-3000}/health/ready
```

If TLS is terminated by a host proxy, also verify the public URL:

```bash
curl -fsS https://api.example.com/health/ready
```

## Update Deploy

Set new image tags in `.env.production`, then:

```bash
cd /opt/awamir-plus

docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker

docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps api worker
docker compose --env-file .env.production -f docker-compose.prod.yml ps api worker
curl -fsS http://127.0.0.1:${PORT:-3000}/health/ready
```

Minimal downtime approach:

- Run migrations before recreating API/worker.
- Recreate `api` and `worker` only with `--no-deps`.
- Keep Postgres and Redis running.
- Use a reverse proxy with short upstream retry/failover settings.

For true zero downtime, add a second API replica behind a production reverse proxy or load balancer. Keep the worker singleton unless the outbox worker is explicitly tested for multi-worker concurrency.

## Rollback

Application rollback to the previous image tag:

```bash
cd /opt/awamir-plus

# Edit .env.production and restore the previous known-good image tags.
$EDITOR .env.production

docker compose --env-file .env.production -f docker-compose.prod.yml pull api worker
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps api worker
docker compose --env-file .env.production -f docker-compose.prod.yml ps api worker
curl -fsS http://127.0.0.1:${PORT:-3000}/health/ready
```

Database migrations are forward-only by default. If rollback requires schema reversal, prepare and test a reviewed SQL rollback against staging first. Do not run destructive database commands ad hoc in production.

## Backups

Create a logical PostgreSQL backup:

```bash
mkdir -p backups
backup_file="backups/awamir-plus-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${backup_file}"

sha256sum "${backup_file}" > "${backup_file}.sha256"
```

Restore into a fresh database after review:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists < backups/<backup-file>.dump
```

Backup policy:

- Take a backup before every production migration.
- Keep daily backups for at least 7 days and weekly backups for at least 4 weeks.
- Store a copy outside the production host.
- Periodically restore to staging to prove backups are usable.

Redis persistence:

- Redis uses AOF with `appendfsync=everysec` by default.
- Redis is queue/cache infrastructure; Postgres is the system of record.
- If Redis is lost, due ERPNext outbox rows can be re-woken by retry/manual operational tooling, while operational records remain in Postgres.

## Logs And Operations

View logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f worker
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f postgres redis
```

Restart only API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

Restart only worker:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart worker
```

Check worker health:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps worker
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 worker
```

Check ERPNext health through Awamir backend:

```bash
curl -fsS http://127.0.0.1:${PORT:-3000}/health/ready
```

When authenticated:

```bash
curl -fsS -X POST \
  -H "authorization: Bearer <AWAMIR_TOKEN>" \
  https://api.example.com/erpnext/validate-connection
```

Do not paste tokens or secrets into shared logs.

## Smoke Verification After Deploy

Minimum:

```bash
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready
```

Recommended:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 worker
```

For ERPNext staging or controlled production smoke, use the existing verifier only with approved smoke credentials and no secrets printed:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node dist/src/scripts/verify-erpnext-staging.js
```

Use that command carefully in production because it creates real operational and ERPNext documents.

## Safety Checklist

- [ ] `.env.production` exists only on the production host and has `chmod 600`.
- [ ] `NODE_ENV=production`.
- [ ] `AUTH_JWT_SECRET` is unique, random, and at least 32 characters.
- [ ] `AUTH_JWT_EXPIRES_IN_SECONDS` is set to a production-safe TTL such as `3600`.
- [ ] `CORS_ALLOWED_ORIGINS` is explicit and not `*`.
- [ ] `ERPNEXT_WORKER_ENABLED=false` for API and `true` for worker.
- [ ] Postgres and Redis have no public ports.
- [ ] API is behind HTTPS and the raw API container port is not publicly reachable.
- [ ] Host firewall allows only approved public ports, typically `22`, `80`, and `443`.
- [ ] Backups are tested before production migration.
- [ ] `/health/live` and `/health/ready` pass after deploy.
- [ ] Worker container is running and healthy.
- [ ] Login, refresh, logout, and password change pass after deploy.
- [ ] Credential hygiene endpoint reviewed and demo credentials retired.
- [ ] Admin settings masks ERPNext API secrets.
- [ ] Redis auth rate-limit keys appear after a controlled auth-abuse smoke.
- [ ] Logs contain no JWTs, ERPNext API secrets, database URLs, or passwords.
- [ ] No Flutter build contains ERPNext URL or credentials.

## Remaining Production Risks

- Compose gives minimal downtime, not true blue/green deployment.
- Worker is intended as a singleton unless multi-worker concurrency is explicitly load-tested.
- Database rollback remains manual and must be planned per migration.
- Rate limiting and WAF/CDN policy should be finalized before public production exposure.
- Secret rotation procedure should be rehearsed for JWT and ERPNext credentials.
- SSH should be key-only with named operators before production launch.
