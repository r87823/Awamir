# R24-T05 Production Security Final Checklist

## Purpose

Run the final production security readiness pass before field testing. This is a verification, documentation, and low-risk hardening task; it does not change ERPNext mapping, Flutter behavior, database schema, or operational workflows.

## Changes

- Support `CORS_ALLOWED_ORIGINS` as the preferred CORS env with fallback to existing `CORS_ORIGINS`.
- Document explicit non-wildcard CORS for staging/production.
- Document production JWT requirements and recommended access-token TTL.
- Expand the auth security runbook with credential retirement, SSH hardening, API bind/firewall guidance, Redis rate-limit inspection, and final smoke checks.
- Expand production Docker docs with final security checklist items.

## Checklist Result

Local review:
- Environment examples require strong JWT placeholders and refresh token TTL.
- Production CORS is explicit and non-wildcard.
- Staging/production have no fallback JWT secret when `NODE_ENV` is strict.
- Secret redaction covers authorization, API keys, API secrets, passwords, secrets, and tokens.
- Access-token full revocation remains future work; recommended `tokenVersion/sessionVersion` is documented.

Staging verification:
- Pending deployment and smoke verification.

## Go / No-Go Criteria

Field testing is Go when:
- CI is green.
- Staging API/worker run the R24-T05 image tag and are healthy.
- Auth smoke passes: login, refresh, logout, change-password.
- Admin security checks pass: credential hygiene and settings secret masking.
- CORS/security headers are present.
- Redis rate-limit keys appear after controlled abuse smoke.
- Recent logs show no token, password, JWT secret, or ERPNext secret leakage.

Public production remains No-Go until:
- Demo credentials are rotated or retired.
- SSH is key-only with restricted operators.
- Raw API port exposure is blocked by firewall/private network.
- Backups and rollback have been rehearsed.
