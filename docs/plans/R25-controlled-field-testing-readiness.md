# R25 Controlled Field Testing Readiness

## Summary

R25 prepares Awamir Plus for a limited real-world pilot with runbooks, onboarding checklists, incident handling, and a read-only readiness helper. It does not change backend business logic, ERPNext mapping, Flutter behavior, Prisma schema, staging data, or deployment infrastructure.

## Changes

- Added a controlled field-testing runbook.
- Added operator onboarding checklist.
- Added incident handling checklist.
- Added a field-test readiness helper script.
- Documented the recommended initial pilot scope and stop-test conditions.

## Checklist Outcome

Ready for controlled field testing when:

- Staging health and readiness checks pass.
- API and worker are healthy.
- ERPNext validate-connection passes from the backend.
- Real users are onboarded with least privilege and correct scopes.
- Demo or weak credentials are rotated, disabled, or explicitly accepted for staging-only use.
- Backup creation and application rollback commands are known.
- Cashbox and accounting daily-close responsibilities are assigned.

## Recommended Pilot Scope

- One branch.
- One production center.
- Two production departments.
- One driver.
- One cashier.
- One accountant.
- 10-20 real orders per day.
- Expand only after two clean operating days.

## Known Limitations

- Payment Entry duplicate handling remains an R19 follow-up.
- No offline mode.
- No push notifications.
- No printer/device integration beyond manual operational checks.
- Public production remains blocked until demo credentials, SSH key-only access, firewall/private API binding, and backup restore rehearsal are completed.

## Verification

Local verification:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `bash -n scripts/field-test-readiness.sh`

Optional staging verification:

```bash
AWAMIR_FIELD_TEST_API_BASE_URL=https://api-staging.r8787m.cc \
  scripts/field-test-readiness.sh
```

With a short-lived admin token:

```bash
AWAMIR_FIELD_TEST_API_BASE_URL=https://api-staging.r8787m.cc \
AWAMIR_FIELD_TEST_TOKEN=<token> \
  scripts/field-test-readiness.sh
```
