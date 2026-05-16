# R24-T01 Auth / Session / Security Hardening

## Purpose / Big Picture

Harden Awamir Plus authentication, session handling, and HTTP security defaults before production readiness while preserving the existing Flutter login/session flow and backend permission architecture.

## Scope

Included:

- JWT configuration review and stricter staging/production secret validation.
- Access-token issuer/audience support.
- Login abuse protection with route-specific in-memory rate limiting.
- Password policy centralization for admin-created/updated passwords.
- Disabled/deleted user check for JWT-protected requests.
- Security headers and environment-driven CORS middleware.
- Auth/logging redaction improvements.
- Auth/security tests and documentation outcome.

Excluded:

- Refresh token persistence/rotation.
- Password reset flow.
- MFA.
- Flutter changes.
- ERPNext workflow or payload mapping changes.
- Staging DB reset or seed refresh.

## Files Expected To Change

- `apps/api/src/auth/*`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/security/*`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/observability/*`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/observability.e2e-spec.ts`
- `.env.example`, `.env.staging.example`, `.env.production.example`
- `docs/plans/R24-T01-auth-session-security-hardening.md`

## Data Model Changes

None.

## API Changes

No response-shape changes for successful login. Existing `POST /auth/login` remains compatible with Flutter.

Error behavior additions:

- `AUTH_RATE_LIMITED` with HTTP 429 for repeated failed login attempts.
- `TOKEN_USER_INACTIVE` with HTTP 403 for disabled/deleted users using an old JWT.
- `ADMIN_PASSWORD_POLICY_VIOLATION` with HTTP 400 for weak admin-created/updated passwords.

## State Transitions

None.

## Authorization

Protected endpoints continue to use permission metadata and `PermissionsGuard`. The guard now verifies that a bearer token subject still maps to an active, non-deleted user before accepting token permissions.

## Idempotency

No idempotent mutation changes.

## Audit Logs

Sensitive admin user mutations already write audit logs. R24 adds auth audit events for failed and rate-limited login attempts without recording passwords or tokens.

## Tests

- Invalid login rate limiting.
- Disabled user with old token is denied.
- Admin password policy and hashing.
- No `passwordHash` exposure remains.
- Security headers and CORS behavior.
- Redacted request logging path query parameters.
- Existing auth flow still works.

## Acceptance Criteria

- [ ] Existing Flutter-compatible login response remains stable.
- [ ] Staging/production JWT secret must be env-provided and strong enough.
- [ ] Login abuse is rate-limited without global API throttling.
- [ ] Disabled/deleted users cannot keep using old bearer tokens on protected endpoints.
- [ ] Admin password create/update path hashes and enforces policy.
- [ ] Security headers and CORS are environment-driven.
- [ ] Logs and errors redact tokens, passwords, secrets, and sensitive query params.
- [ ] Tests pass.

## Progress

- [x] Step 1: Read project rules, current auth, observability, seed, and deployment config.
- [x] Step 2: Implement focused hardening changes.
- [x] Step 3: Add tests.
- [x] Step 4: Run validation.
- [ ] Step 5: Deploy if required.

## Surprises & Discoveries

- `AUTH_JWT_SECRET` was required only in production; staging could fall back to the dev secret if misconfigured.
- JWT tokens were self-contained; protected endpoints did not re-check whether the user had later been disabled.
- Runtime security headers/CORS were not centralized.
- Login had no route-specific abuse protection.
- Staging/demo users intentionally still use seeded `demo` credentials; R24 will report this but not rotate automatically.
- Local e2e could not run because Docker/Postgres was unavailable at `localhost:55432`.

## Decision Log

- Use an in-process login limiter for R24 to avoid new infrastructure and avoid throttling operational APIs.
- Keep refresh tokens as an R24 follow-up because introducing revocable sessions requires schema and mobile session UX changes.
- Re-check active user state only on protected endpoints that already execute the `PermissionsGuard`, preserving public login behavior and minimizing DB load.

## Outcome

Implemented:

- JWT signing now includes `iat`, optional issuer, and optional audience.
- `AUTH_JWT_SECRET` is required in staging and production and must be at least 32 characters.
- Protected endpoints reject bearer tokens whose user is disabled or deleted.
- Login failures and rate-limit events create audit records without password/token data.
- Login has route-specific in-memory rate limiting keyed by client IP and username.
- Admin password creation/update uses a shared policy with configurable minimum length and bcrypt cost.
- Baseline security headers and environment-driven CORS are applied centrally.
- Request logging redacts sensitive query parameters.
- Env examples document auth, CORS, rate-limit, and proxy settings.

Validation:

- `pnpm format` passed.
- `pnpm prisma:generate` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm test:e2e` was attempted and blocked by unavailable local Postgres/Docker (`localhost:55432` unreachable).

Remaining:

- Refresh-token rotation/logout and session revocation table are deferred to R24-T02.
- Demo/staging `demo` passwords are identified as a staging risk and should be rotated through an approved operational runbook.
