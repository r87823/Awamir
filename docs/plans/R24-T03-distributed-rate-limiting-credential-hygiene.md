# R24-T03 Distributed Rate Limiting And Credential Hygiene

## Purpose / Big Picture

Move auth abuse protection from per-process memory to Redis so staging/production can safely run multiple API replicas. Add credential hygiene visibility for operators and an admin-controlled forced password rotation flag without changing the existing Flutter login response contract or ERPNext workflows.

## Scope

Included:
- Replace the in-memory auth limiter with a Redis-backed limiter.
- Preserve a degraded in-memory fallback if Redis is temporarily unavailable.
- Apply rate limiting to login and refresh paths.
- Apply light admin-sensitive throttling to password/user mutation endpoints.
- Add credential hygiene metadata and admin report endpoint.
- Add `requirePasswordChange` and `passwordChangedAt` fields on `users`.
- Allow admins to force/clear password rotation through existing user update APIs.
- Block login when `requirePasswordChange=true`.
- Clear password rotation requirement when an admin sets a new password.
- Add audit/security telemetry for rate limits, refresh abuse, and forced rotation.

Excluded:
- Flutter password-change screen.
- Self-service password reset or change password endpoint.
- Account lockout table or permanent lockout policy.
- Rotating existing staging credentials automatically.
- ERPNext, payments, cashbox, accounting, or workflow changes.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*/migration.sql`
- `apps/api/src/auth/auth-rate-limiter.service.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/admin.types.ts`
- `.env.example`
- `.env.staging.example`
- `.env.production.example`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/admin.e2e-spec.ts`
- `docs/plans/R24-T03-distributed-rate-limiting-credential-hygiene.md`

## Data Model Changes

Add to `users`:
- `require_password_change BOOLEAN NOT NULL DEFAULT false`
- `password_changed_at TIMESTAMP(3)`

No destructive data changes.

## API Changes

Existing login:
- `POST /auth/login`
  - Returns current response shape unchanged on success.
  - Returns `PASSWORD_CHANGE_REQUIRED` when a valid user is flagged for forced password rotation.

Existing refresh:
- `POST /auth/refresh`
  - Adds Redis-backed abuse throttling.

Admin:
- `PATCH /admin/users/:id`
  - Accepts `requirePasswordChange?: boolean`.
  - Setting a new password clears `requirePasswordChange` and updates `passwordChangedAt`.
- `GET /admin/security/credential-hygiene`
  - Permission: `admin.users.view`.
  - Returns warnings only; no password hashes or secrets.

Error codes:
- `AUTH_RATE_LIMITED`
- `PASSWORD_CHANGE_REQUIRED`

## State Transitions

User credential rotation:
- normal -> admin forces rotation -> `requirePasswordChange=true`
- forced rotation -> admin sets password -> `requirePasswordChange=false`, `passwordChangedAt=now`

## Authorization

- No direct role checks.
- Admin credential hygiene endpoint requires `admin.users.view`.
- Admin mutation endpoints keep existing `admin.users.manage`.

## Idempotency

- Rate limiter increments are atomic in Redis.
- Admin setting `requirePasswordChange` is naturally idempotent.

## Audit Logs

Add/confirm:
- `auth.login_failed`
- `auth.login_success`
- `auth.rate_limited`
- `auth.refresh_rate_limited`
- `auth.refresh_reuse_detected`
- `admin.user.password_rotation_required`
- `auth.sessions_revoked_due_to_password_change`

No raw password, access token, refresh token, token hash, or secret values in audit payloads.

## Tests

Unit tests:
- Redis-backed limiter allows until max and rejects after max.
- Redis failures fall back without total auth outage.
- Legacy env names remain compatible.

E2E tests:
- repeated invalid login attempts are rate limited with new env names.
- refresh abuse throttles repeated invalid refresh attempts.
- credential hygiene endpoint reports seeded/demo credential warnings.
- admin can force password rotation.
- login is blocked with `PASSWORD_CHANGE_REQUIRED`.
- admin password update clears rotation and login succeeds.
- user/admin responses do not expose password hashes.

## Acceptance Criteria

- Auth rate limits are shared through Redis when Redis is available.
- Redis failures degrade safely.
- Existing Flutter login success response remains compatible.
- Forced rotation does not expose passwords or hashes.
- No secret/token logging is introduced.
- Staging is backed up before migration and deployed with immutable images.

## Progress

- [x] Step 1: Review current auth limiter, Redis helpers, user schema, and admin APIs.
- [x] Step 2: Add schema and migration.
- [x] Step 3: Implement Redis-backed limiter and auth/admin integration.
- [x] Step 4: Add credential hygiene endpoint.
- [x] Step 5: Add tests and run validation.
- [ ] Step 6: Commit, push, backup staging DB, deploy, and verify.

## Surprises & Discoveries

- The current limiter is fully in-memory and synchronous, so auth service methods must await limiter operations after the Redis migration.
- Existing R24-T02 runtime deploy surfaced that production images should use direct Prisma CLI rather than `pnpm prisma:migrate:deploy`.

## Decision Log

- Keep deprecated `AUTH_LOGIN_RATE_LIMIT_MAX` and `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS` as fallback env names for compatibility, but document the new R24-T03 names.
- Do not auto-rotate seeded/demo credentials in code or staging data; report warnings only.
- Use Redis atomic `INCR` + `PEXPIRE` for cross-replica consistency.

## Outcome

Implemented locally. Validation completed:
- `pnpm prisma:generate` passed.
- `pnpm format` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm --filter @awamir/api build` passed.

Local `pnpm prisma:migrate:dev` and `pnpm test:e2e` are blocked by missing local PostgreSQL at `localhost:55432`; staging deploy will use the existing safe backup + `prisma migrate deploy` path.
