# R21-T01 Staging Deployment Drill From Registry Images

## Purpose / Big Picture

Convert the existing staging deployment on `46.202.154.140` from manual copied source/local image builds into a production-like deployment that pulls immutable API and worker image tags from a registry.

The staging domain remains:

```text
https://api-staging.r8787m.cc
```

## Scope

Included:

- Image registry and tag strategy for API and worker.
- GitHub Actions image publish workflow.
- Staging env template image variables.
- Staging Compose cleanup so staging-specific behavior lives in `docker-compose.staging.yml`.
- Staging runbook updates for first deploy, update, rollback, logs, health, worker checks, and ERPNext smoke.

Excluded:

- Flutter business behavior changes.
- ERPNext payload mapping or business workflow changes.
- Production deployment.
- Staging data reset or volume removal.
- Real secrets in git.

## Image Strategy

Registry:

- `ghcr.io/r87823/awamir-plus-api`
- `ghcr.io/r87823/awamir-plus-worker`

Tags:

- `sha-<12-char-git-sha>` for immutable deploys and rollbacks.
- `staging` for latest `develop` convenience.
- `v*` release tags for future production promotion.

Rollback is performed by restoring the previous `sha-<12-char-git-sha>` in `.env.staging`.

## Files Expected To Change

- `.github/workflows/docker-images.yml`
- `.env.staging.example`
- `docker-compose.prod.yml`
- `docker-compose.staging.yml`
- `docs/deployment/staging-deployment.md`
- `docs/plans/R21-T01-staging-deployment.md`

## Data Model Changes

None.

## API Changes

None.

## State Transitions

None.

## Authorization

No authorization changes.

## Idempotency

No idempotency changes.

## Audit Logs

No audit log changes.

## Tests

Verification:

- `docker compose --env-file .env.staging.example -f docker-compose.prod.yml -f docker-compose.staging.yml config`
- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Docker daemon-dependent image build/pull/deploy is documented but not required locally when Docker is unavailable.

## Acceptance Criteria

- [x] Staging image naming/tagging strategy is documented.
- [x] GitHub Actions image publish workflow exists.
- [x] Staging deploy docs use registry image tags, not copied source/local images.
- [x] Staging compose override remains staging-specific.
- [x] `.env.staging.example` contains image placeholders only, no secrets.
- [x] Staging deploy, update, rollback, logs, health, worker, and ERPNext smoke commands are documented.
- [x] Compose staging config validates with the example env.
- [x] Existing lint/typecheck/test checks pass.

## Progress

- [x] Step 1: Review current staging compose/docs and CI.
- [x] Step 2: Define GHCR image naming and tag strategy.
- [x] Step 3: Add Docker image publish workflow.
- [x] Step 4: Update staging env/docs for image-based deploy.
- [x] Step 5: Validate compose and repo checks.

## Surprises & Discoveries

- The current staging server directory is not a git repo. R21 keeps that acceptable by making the server consume registry images and only deliberate deployment files.
- `.env.production.example` was initially ignored by `.gitignore` because `.env.*` is ignored; `.gitignore` now explicitly unignores it.
- Docker daemon was unavailable in the local environment, so image build/run validation could not be executed locally. Compose config validation does not require the daemon and passed.

## Decision Log

- Use GHCR because the repo already uses GitHub Actions and GitHub packages avoid adding new infrastructure.
- Prefer pinned `sha-<short-sha>` tags for staging deployments; keep `staging` as a convenience alias.
- Use `docker compose pull` plus `up --no-build` on staging to avoid accidental host-local builds.
- Preserve Postgres and Redis volumes; never use `down -v` as part of staging updates.

## Outcome

R21 registry-image staging deployment drill is documented and ready. Staging can be updated by changing `AWAMIR_API_IMAGE` and `AWAMIR_WORKER_IMAGE` in server-only `.env.staging`, pulling images, running migrations explicitly, and recreating only `api` and `worker`.

Remaining operational action:

- Run the new GitHub Actions Docker Images workflow or manual build-push command, then perform the documented staging update on `46.202.154.140`.
