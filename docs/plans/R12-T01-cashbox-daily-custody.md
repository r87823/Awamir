# R12-T01 Cashbox Daily Custody

## Purpose / Big Picture

Cash collectors get a daily cashbox that automatically receives cash payment entries. Cashiers can review, approve, return, and close the day using server-calculated expected cash and differences.

## Scope

Included: Prisma cashbox schema, cash payment attachment to daily cashboxes, cashbox lifecycle APIs, permissions, audit logs, and tests.

Excluded: Flutter changes, ERPNext calls, cashbox reopening endpoint, and full accounting/cashbox settlement beyond custody status.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/src/cashboxes/*`
- `apps/api/src/payments/*`
- `apps/api/test/*`

## Data Model Changes

- Add `CashboxStatus`.
- Add `cashboxes` table with collector/date uniqueness, expected/collected/difference cash, lifecycle timestamps, soft delete, and version.
- Add optional `cashbox_id` relation to `pending_cashbox_entries`.

## API Changes

- `GET /cashboxes/my/today`
- `GET /cashboxes/my`
- `POST /cashboxes/:id/submit`
- `GET /cashboxes`
- `GET /cashboxes/:id`
- `POST /cashboxes/:id/review`
- `POST /cashboxes/:id/approve`
- `POST /cashboxes/:id/return`
- `POST /cashboxes/close-day`

## State Transitions

- `OPEN` or `RETURNED` -> submit -> `SUBMITTED`
- `SUBMITTED` -> review -> `UNDER_REVIEW`
- `UNDER_REVIEW` -> approve -> `APPROVED`
- `SUBMITTED` or `UNDER_REVIEW` -> return -> `RETURNED`
- `APPROVED` -> close day -> `CLOSED`

## Authorization

All endpoints use permission metadata. Own views/actions are scoped to `actor.actorId ?? actor.driverId`; all views use `cashbox.view_all`.

## Idempotency

Payment idempotency remains the source of truth for cash entry creation. Daily cashbox uniqueness is enforced by `collector_user_id + business_date`.

## Audit Logs

- `cashbox.opened`
- `cashbox.entry_attached`
- `cashbox.submitted`
- `cashbox.under_review`
- `cashbox.approved`
- `cashbox.returned`
- `cashbox.day_closed`

## Tests

- Cash payment auto-opens and attaches to daily cashbox.
- Multiple cash payments aggregate expected cash.
- Submit, review, approve, return, and close-day transitions.
- Required return reason.
- Approved cashbox immutability.
- Own/all visibility enforcement.

## Acceptance Criteria

- [ ] Cash payment creates or attaches to daily cashbox.
- [ ] Expected cash equals cash entry sum.
- [ ] Submit calculates difference.
- [ ] Cashier review/approve/return works.
- [ ] Approved cashbox cannot be changed.
- [ ] Close day follows pending/approved rules.
- [ ] Permissions and own/all scopes are enforced.

## Progress

- [x] Step 1: Execution plan created.
- [x] Step 2: Schema and migration implemented.
- [x] Step 3: Cashbox service/controller implemented.
- [x] Step 4: Payment cash path attached to cashboxes.
- [x] Step 5: Tests and verification completed.

## Surprises & Discoveries

- R11 already introduced `pending_cashbox_entries`, so R12 should extend that path instead of creating another payment cash record type.

## Decision Log

- Use `actor.actorId ?? actor.driverId` as the collector key for daily cashbox ownership.
- `GET /cashboxes/my/today` is read-only and does not auto-create empty cashboxes.
- Returned cashboxes may be resubmitted; no separate reopen endpoint is added.

## Outcome

Implemented and verified with format, Prisma generation/migration, lint, typecheck, unit tests, and e2e tests.
