# R24-T04 Password Change, Access Token Revocation Review, And Security Runbook

## Purpose

Close the remaining R24 auth gaps before production readiness by adding a self-service password change API, documenting access-token revocation tradeoffs, and creating a production security runbook.

## Scope

Included:
- `POST /auth/change-password` using `username`, `currentPassword`, and `newPassword`.
- Forced-rotation recovery without issuing an access token.
- Refresh session revocation after password change.
- Limited active-session checks for auth session-management endpoints.
- Security runbook for credential rotation and incident handling.

Excluded:
- Flutter password-change UI.
- MFA.
- Password reset email.
- Global access-token denylist.
- ERPNext, payment, cashbox, accounting, or workflow changes.

## Design Decisions

- Password change is credential-based so a user blocked by `PASSWORD_CHANGE_REQUIRED` can resolve the rotation.
- Password changes revoke all active refresh sessions, including the caller's current session, forcing a clean re-login.
- Existing access tokens remain stateless for general API requests until expiry.
- `/auth/sessions` and `/auth/logout-all` now reject access tokens whose embedded session id is no longer active.
- No schema migration is required; R24-T03 already added password rotation fields.

## Validation

- Add e2e coverage for success, wrong current password, weak new password, forced rotation clearing, refresh revocation, login after change, response secrecy, audit logs, and revoked-session access rejection.
- Run:
  - `pnpm format`
  - `pnpm prisma:generate`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e` when local DB is available or through CI.

## Outcome

Implemented locally. Validation completed:
- `pnpm format` passed.
- `pnpm prisma:generate` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm --filter @awamir/api build` passed.

Local `pnpm test:e2e` is blocked by missing local PostgreSQL at `localhost:55432`; CI/staging will provide the full API behavior verification.
