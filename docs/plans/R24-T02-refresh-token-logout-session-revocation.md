# R24-T02 Refresh Token, Logout, And Session Revocation

## Purpose / Big Picture

Add a production-grade session foundation on top of the existing database-backed auth flow. Login will continue returning the existing access token shape for current Flutter/mobile clients, while also issuing a hashed refresh-token-backed session. Users can refresh, logout, logout all sessions, and view their own session metadata. Admin deactivation/password changes will revoke active sessions.

## Scope

Included:
- Add `auth_sessions` table for refresh token session metadata.
- Store refresh token hashes only.
- Extend login response with `accessToken`, `refreshToken`, `expiresIn`, and `refreshExpiresIn`, while preserving `token`.
- Add `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, and `GET /auth/sessions`.
- Rotate refresh tokens on every refresh.
- Detect refresh token reuse and revoke active sessions for that user.
- Revoke sessions on admin user deactivation and admin password change.
- Add admin session visibility/revocation metadata endpoints if it fits cleanly.
- Add audit logs for refresh/logout/session revocation.
- Update env examples/docs for refresh token TTL.

Excluded:
- Flutter token refresh integration. Existing access-token-only mobile flow remains compatible.
- Password reset email or self-service password change workflows.
- Device management UI.
- ERPNext, payments, cashboxes, accounting, and workflow changes.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*/migration.sql`
- `apps/api/src/auth/*`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/admin.types.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/admin.e2e-spec.ts`
- `.env.example`
- `.env.staging.example`
- `.env.production.example`
- `docs/plans/R24-T02-refresh-token-logout-session-revocation.md`

## Data Model Changes

Add `AuthSession` mapped to `auth_sessions`:
- `id`
- `userId`
- `refreshTokenHash`
- `userAgent`
- `ipHash`
- `createdAt`
- `expiresAt`
- `revokedAt`
- `revokedReason`
- `replacedBySessionId`
- `lastUsedAt`

Indexes:
- `userId`
- `expiresAt`
- `revokedAt`

Only token hashes are persisted. Raw refresh tokens are returned once to the client and never stored.

## API Changes

Existing:
- `POST /auth/login`
  - Still returns `token` for backward compatibility.
  - Adds `accessToken`, `refreshToken`, `expiresIn`, and `refreshExpiresIn`.

New:
- `POST /auth/refresh`
  - Body: `{ refreshToken: string }`
  - Rotates the refresh token and returns the same auth response shape as login.
- `POST /auth/logout`
  - Body may include `{ refreshToken?: string }`; if omitted, the bearer token session id is used when present.
  - Idempotently revokes the session.
- `POST /auth/logout-all`
  - Requires valid bearer access token.
  - Revokes all active sessions for the authenticated user.
- `GET /auth/sessions`
  - Requires valid bearer access token.
  - Returns metadata only, no hashes or tokens.

Optional admin endpoints:
- `GET /admin/users/:id/sessions`
- `POST /admin/users/:id/sessions/revoke`

Error codes:
- `INVALID_REFRESH_TOKEN`
- `REFRESH_TOKEN_REUSED`
- `REFRESH_TOKEN_EXPIRED`
- `USER_INACTIVE`
- `AUTHENTICATION_REQUIRED`

## State Transitions

Auth session lifecycle:
- active -> refresh -> revoked with `rotated`, new active replacement session created.
- active -> logout -> revoked with `logout`.
- active -> logout-all -> revoked with `logout_all`.
- active -> admin revocation -> revoked with admin reason.
- revoked refresh reused -> reject and revoke remaining active sessions for that user.

## Authorization

- Login and refresh are public auth endpoints.
- Logout may use either refresh token or bearer token.
- Logout-all and own session list require bearer access token.
- Admin session visibility uses `admin.users.view`.
- Admin session revocation uses `admin.users.manage`.
- No direct role checks in controllers.

## Idempotency

- Logout is idempotent; repeated calls return success if the session is already revoked or absent.
- Logout-all is idempotent; repeated calls leave no active sessions.
- Refresh rotation is single-use; a rotated/revoked refresh token cannot be reused.

## Audit Logs

Add/confirm:
- `auth.login_success`
- `auth.login_failed`
- `auth.refresh_success`
- `auth.refresh_reuse_detected`
- `auth.logout`
- `auth.logout_all`
- `auth.session_revoked`
- `auth.sessions_revoked_due_to_user_deactivation`
- `auth.sessions_revoked_due_to_password_change`

Audit payloads must not include access tokens, refresh tokens, or token hashes.

## Tests

Add/update e2e tests:
- login returns access token and refresh token while preserving `token`.
- refresh rotates token.
- reused refresh token is rejected and active sessions are revoked.
- logout revokes session.
- logout-all revokes all user sessions.
- disabled user cannot refresh.
- raw refresh token is not stored in DB.
- existing protected endpoint access still works with access token.
- admin deactivation revokes sessions.
- admin password update revokes sessions.
- session metadata endpoints do not expose hashes or raw tokens.

## Acceptance Criteria

- Refresh tokens are hashed in DB and never logged.
- Existing access token auth remains compatible.
- Disabled/deleted users cannot refresh.
- Logout and logout-all revoke sessions.
- Admin deactivation/password change revokes active sessions.
- Tests pass or blockers are documented.
- Staging migration is backed up before deploy.

## Progress

- [x] Step 1: Review current auth/admin/schema shape.
- [x] Step 2: Add schema and migration.
- [x] Step 3: Implement session service helpers and auth endpoints.
- [x] Step 4: Hook admin deactivation/password update to session revocation.
- [x] Step 5: Add tests.
- [x] Step 6: Run validation.
- [ ] Step 7: Commit, push, backup staging DB, deploy, and verify.

## Surprises & Discoveries

- R24-T01 already re-checks active users for protected access tokens, so R24-T02 can focus session revocation on refresh tokens without breaking existing access tokens.
- Current login response only has `token` and `user`; `token` must remain as an alias for compatibility.
- Local `prisma:migrate:dev` and `pnpm test:e2e` are blocked because PostgreSQL is not reachable on `localhost:55432`. Docker Desktop is also not running locally, so local compose cannot start Postgres/Redis.

## Decision Log

- Store `ipHash` instead of raw IP address to reduce retained sensitive session metadata.
- Use `AUTH_REFRESH_TOKEN_TTL_DAYS` with a default of 30 days.
- Use `AUTH_REFRESH_TOKEN_SECRET` when present, otherwise derive refresh token hashes from `AUTH_JWT_SECRET` to avoid requiring an immediate staging secret change.
- Add a `sid` claim to newly issued access tokens. Old access tokens without `sid` remain valid.

## Outcome

Implementation is complete locally. Validation so far:
- `pnpm format`: passed.
- `pnpm prisma:generate`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed.
- `pnpm prisma:migrate:dev`: blocked by unavailable local Postgres on `localhost:55432`.
- `pnpm test:e2e`: blocked by unavailable local Postgres on `localhost:55432`.

Staging deploy and staging e2e smoke verification are pending.
