# Auth Security Runbook

## Purpose

This runbook covers operational security procedures for Awamir Plus authentication, session handling, credential rotation, and incident response. Flutter must continue to call only Awamir Plus Backend. ERPNext credentials must remain backend-only.

## Routine Credential Hygiene

- Review `GET /admin/security/credential-hygiene` before every production release.
- Rotate all demo or weak seeded passwords before production.
- Disable unused staging/demo users instead of deleting them when audit history matters.
- Use `POST /auth/change-password` for self-service password rotation when the current password is known.
- Use admin user update to force rotation by setting `requirePasswordChange=true` when a credential is suspected weak but not yet confirmed compromised.
- Confirm `GET /admin/settings` masks ERPNext secrets and never returns raw API keys or API secrets.

## Demo And Staging Credential Retirement

1. List flagged credentials through the admin hygiene endpoint.
2. For each active demo user, either set a strong generated password or deactivate the user.
3. Verify `requirePasswordChange=false` only for accounts that received a production-safe password.
4. Confirm no production operator uses `demo`, `password`, `secret123`, username-based passwords, or shared credentials.

## AUTH_JWT_SECRET Rotation

Rotating `AUTH_JWT_SECRET` invalidates existing access tokens and refresh token hashes when `AUTH_REFRESH_TOKEN_SECRET` is not set separately.

Recommended controlled rotation:
1. Announce a maintenance window.
2. Set a new strong `AUTH_JWT_SECRET` in the server secret store or env file.
3. If used, rotate `AUTH_REFRESH_TOKEN_SECRET` at the same time.
4. Restart API containers.
5. Ask users to log in again.
6. Verify `/health/ready`, login, refresh, and logout.

Rollback:
- Restore the previous secret only if the new secret was misconfigured and the old secret has not been compromised.

## ERPNext Credential Rotation

1. Rotate the ERPNext API key/secret inside ERPNext staging or production.
2. Update only backend environment configuration.
3. Restart API and worker containers.
4. Run ERPNext validate-connection through the backend.
5. Verify worker logs do not contain ERPNext secrets.

Flutter must never receive ERPNext URL, API key, API secret, or ERPNext SDK configuration.

## Compromised User Response

1. Deactivate the user through the admin API.
2. Verify active refresh sessions are revoked.
3. Review audit logs for recent login, refresh, admin, payment, cashbox, and accounting actions by that user.
4. Re-enable only after password reset/rotation and manager approval.

For a suspected password compromise without confirmed account misuse:
1. Set `requirePasswordChange=true`.
2. Revoke active sessions.
3. Ask the user to change the password with `POST /auth/change-password`.

## Refresh Token Reuse Response

`auth.refresh_reuse_detected` means an already-rotated or revoked refresh token was used.

Immediate steps:
1. Treat the user session family as compromised.
2. Confirm the system revoked active sessions for the user.
3. Force password rotation.
4. Review source IP and user agent metadata from session/audit records.
5. Watch for repeated attempts from the same network.

## Rate-Limit Inspection

Redis-backed auth limiter keys use the `auth:rate-limit:*` prefix.

Safe inspection:
```bash
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  exec redis redis-cli --scan --pattern 'auth:rate-limit:*'
```

Do not dump or publish raw operational logs. Rate-limit keys are hashed and temporary, but they should still be treated as operational metadata.

## CORS And Headers

Production and staging must set explicit CORS origins.

- Preferred env: `CORS_ALLOWED_ORIGINS`.
- Backward-compatible env: `CORS_ORIGINS`.
- Do not use `*` in staging or production.
- Keep `CORS_CREDENTIALS=false` unless browser cookie auth is intentionally introduced.

Expected security headers:
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: no-referrer`
- `permissions-policy` denies camera, microphone, and geolocation
- `cross-origin-resource-policy: same-site`

## SSH Hardening Plan

Before production:
- Disable password SSH login.
- Use key-only SSH for named operators.
- Disable direct root login where practical; use a restricted deploy user with sudo for Docker operations.
- Store deploy keys in the approved secret manager.
- Rotate any shared or temporary SSH credentials used during staging.
- Allow only ports `22`, `80`, and `443` publicly unless a documented exception exists.
- Restrict Docker group access to deployment operators only.
- Keep backup files readable only by root or the deploy operator.

## API Network Exposure

Production API containers should bind to `127.0.0.1` or a private network behind a reverse proxy/load balancer. Binding the API directly to `0.0.0.0:3000` is not production-ready unless a host firewall or private load balancer blocks public access to port `3000`.

Postgres and Redis must remain internal-only Compose services with no public host port exposure.

## Verification Checklist

After auth/security deploys:
- `/health/live` passes.
- `/health/ready` passes.
- Login succeeds for an approved user.
- Refresh succeeds and rotates the refresh token.
- Logout revokes the refresh token.
- Password change succeeds with current password.
- Old refresh token is rejected after password change.
- Credential hygiene endpoint returns warnings only and does not expose password hashes.
- Admin settings endpoint masks secret settings.
- Redis auth rate-limit keys appear after an auth-abuse smoke test.
- Security headers and explicit CORS origin behavior are present.
- Recent API/worker logs do not contain access tokens, refresh tokens, password hashes, passwords, JWT secrets, or ERPNext secrets.

## Remaining Access Token Risk

Access tokens are stateless for normal protected requests until expiry. Current mitigation is:
- short configurable access-token TTL; use `900` to `3600` seconds for production,
- active user recheck for protected requests,
- refresh-session revocation for session renewal,
- active-session check on auth session-management endpoints.

Recommended future work:
- add `tokenVersion` or `sessionVersion` to users,
- include it in access tokens,
- increment it on password change, deactivation, and emergency revocation,
- optionally add a short-lived emergency denylist for high-risk incidents.
