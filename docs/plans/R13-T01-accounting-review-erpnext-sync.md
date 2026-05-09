# R13-T01 Accounting Review And ERPNext Sync Mapping

## Purpose / Big Picture

Accounting users can review orders/payments, enqueue ERPNext sync through the backend sync boundary, retry failed sync work, reconcile payments, and close financial days without becoming daily operational actors.

## Scope

Included: accounting APIs, review metadata, financial day close model, ERPNext reference storage, sync status mapping, retry backoff/dead-letter, audit logs, and tests.

Excluded: Flutter changes, direct ERPNext HTTP outside `ERPNextClient`, direct ERP imports inside Payments/Cashboxes, and full ERPNext payload design outside `ERPNextSyncService`.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/src/accounting/*`
- `apps/api/src/erpnext/*`
- `apps/api/src/app.module.ts`
- `apps/api/test/*`

## Data Model Changes

- Expand accounting statuses to detailed posting/sync states.
- Add ERPNext references and accounting review metadata on orders/payments.
- Add `financial_day_closes`.
- Add `DEAD_LETTER`, `last_attempt_at`, and `correlation_id` to ERPNext sync models.

## API Changes

- `GET /accounting/dashboard`
- `GET /accounting/orders`
- `POST /accounting/orders/:orderId/review-sales-order`
- `POST /accounting/orders/:orderId/sync-sales-order`
- `POST /accounting/orders/:orderId/review-invoice`
- `POST /accounting/orders/:orderId/sync-invoice`
- `GET /accounting/payments`
- `POST /accounting/payments/:paymentId/review`
- `POST /accounting/payments/:paymentId/sync`
- `POST /accounting/erpnext-sync/:outboxId/retry`
- `POST /accounting/reconcile-payments`
- `POST /accounting/close-financial-day`

## State Transitions

Accounting statuses move only through accounting/sync helpers, never through operational controllers. ERP sync success updates references/accounting state only.

## Authorization

All accounting endpoints use permission metadata. No direct role checks.

## Idempotency

ERPNext sync uses existing deterministic outbox idempotency keys. Financial day close is idempotent by unique business date.

## Audit Logs

- `accounting.sales_order_reviewed`
- `accounting.sales_order_sync_enqueued`
- `accounting.invoice_reviewed`
- `accounting.invoice_sync_enqueued`
- `accounting.payment_reviewed`
- `accounting.payment_sync_enqueued`
- `accounting.payments_reconciled`
- `accounting.financial_day_closed`
- `accounting.erpnext_sync_retried`
- `erpnext_sync_failed`

## Tests

Accounting e2e covers dashboard, permissions, idempotent sync enqueue, retry backoff/dead-letter, close financial day, ERPNext failure persistence, mock success references, and Payments/Cashboxes ERP import boundaries.

## Acceptance Criteria

- [ ] Dashboard returns counts.
- [ ] Review/sync endpoints enforce permissions.
- [ ] Sync enqueue is idempotent.
- [ ] Retry increments retry count and applies backoff/dead-letter.
- [ ] Close financial day enforces cashbox approval rules.
- [ ] Failed sync logs failure and does not rollback local review/enqueue state.
- [ ] Mock success stores ERPNext references.
- [ ] Payments/Cashboxes remain free of ERPNext imports.

## Progress

- [x] Step 1: Plan approved.
- [x] Step 2: Schema and migration implemented.
- [x] Step 3: Accounting module implemented.
- [x] Step 4: ERPNext sync mapping/backoff implemented.
- [x] Step 5: Tests and verification completed.

## Surprises & Discoveries

- Payments/Cashboxes already have no ERPNext imports after the R12 boundary cleanup.

## Decision Log

- Accounting may depend on `ERPNextSyncService`; Payments/Cashboxes may not.
- `ACCOUNTING_POSTED` is only set through a completion helper.
- Retry attempt 5 moves to `DEAD_LETTER`.

## Outcome

Implemented and verified with format, Prisma generation/migration, lint, typecheck, unit tests, e2e tests, and ERPNext import boundary checks for Payments/Cashboxes.
