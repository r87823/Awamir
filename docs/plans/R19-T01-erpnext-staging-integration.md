# R19-T01 ERPNext Staging Integration

## Purpose / Big Picture

Connect Awamir Plus backend to ERPNext staging safely through the existing backend-only outbox/retry/dead-letter boundary. Flutter remains isolated from ERPNext. Operational workflows keep succeeding even when ERPNext is unavailable; sync success/failure only affects accounting references/status and sync logs.

## Scope

Included:
- ERPNext staging env/config validation.
- ERPNext client timeout handling, safe errors, and structured timing logs.
- Real Sales Order, draft Sales Invoice, and draft Payment Entry payload mapping.
- Submit invoice/payment calls through ERPNext client.
- Pre-sync validation for customer, item codes, warehouse, and accounts.
- ERPNext readiness visibility in health output.
- Mock ERPNext support for real doctypes, timeout/duplicate/failure tests.
- Documentation for staging setup and retry/dead-letter lifecycle.

Excluded:
- Flutter changes.
- Direct ERPNext access from Payments/Cashboxes.
- Operational status dependency on ERPNext.
- Full ERPNext master-data sync.
- Persisted per-branch ERP account mapping tables; R19 uses backend env/config defaults.

## Files Expected To Change

- `apps/api/src/erpnext/*`
- `apps/api/src/health/health.controller.ts`
- `apps/erpnext-mock/src/index.ts`
- `apps/api/src/erpnext/*.spec.ts`
- `apps/api/test/erpnext*.e2e-spec.ts`
- `docs/architecture/03-erpnext-sync-lifecycle.md`
- `docs/architecture/04-erpnext-staging-setup.md`
- `docs/plans/R19-T01-erpnext-staging-integration.md`

## Data Model Changes

No Prisma schema changes planned. Existing order, payment, outbox, and sync log fields are enough:
- `order.erpnextSalesOrderId`
- `order.erpnextSalesInvoiceId`
- `payment.erpnextPaymentEntryId`
- `integration_outbox`
- `erpnext_sync_logs`

## API Changes

No new business APIs.

Existing:
- `POST /erpnext/validate-connection`
- `/health`, `/health/ready`

Health output gains an `erpnext` check with connectivity/config status and latency where available.

Standard sync error codes stored in sync logs/outbox last error:
- `validation_failed`
- `connection_failed`
- `duplicate_document`
- `missing_item_code`
- `missing_account`
- `timeout`

## State Transitions

Operational workflow states are unchanged.

ERP sync states remain:
- `PENDING` -> `PROCESSING` -> `SUCCEEDED`
- `PENDING|PROCESSING` -> `FAILED`
- retry helper can move `FAILED|DEAD_LETTER` according to existing retry policy.
- max retry moves to `DEAD_LETTER`.

Accounting references/status are updated only by `ERPNextSyncService` on sync success/failure.

## Authorization

Existing ERPNext endpoints keep permission metadata:
- `erpnext-sync:manage`

Accounting endpoints remain permission-based. No direct role checks.

## Idempotency

Outbox idempotency keys remain:
- `erpnext:sales_order:{orderId}`
- `erpnext:draft_sales_invoice:{orderId}`
- `erpnext:submit_sales_invoice:{orderId}`
- `erpnext:draft_payment_entry:{paymentId}`
- `erpnext:submit_payment_entry:{paymentId}`

Before sending, sync checks existing local ERPNext references where possible and treats already-created documents as successful without creating duplicates.

## Audit Logs

Existing event/audit paths remain:
- `ERPNextSyncSucceededEvent`
- `ERPNextSyncFailedEvent`
- `erpnext_sync_failed`

## Tests

Unit:
- ERPNext client timeout classification.
- Payload validation for missing item/account/customer/warehouse.
- Duplicate/local-reference idempotency.

E2E/mock:
- validate connection with mock ERPNext.
- real doctype create with mock ERPNext stores references.
- timeout creates failed log and does not rollback.
- retry/dead-letter remains respected.
- failed ERP sync does not rollback payment/order.

## Acceptance Criteria

- [x] ERPNext staging envs are supported and validated in staging/production.
- [x] ERPNext authentication validates against staging/mock.
- [x] Health exposes ERPNext connectivity safely.
- [x] Sales Order sync uses real ERPNext doctype payload.
- [x] Draft Sales Invoice sync uses real ERPNext doctype payload.
- [x] Payment Entry sync uses real ERPNext doctype payload.
- [x] Sync errors are classified safely.
- [x] Outbox/retry/dead-letter behavior is preserved.
- [x] No Flutter ERPNext access exists.
- [x] Payments/Cashboxes remain ERPNext-isolated.
- [x] Tests and verification commands pass.

## Progress

- [x] Step 1: Review current ERPNext, accounting, health, and mock implementations.
- [x] Step 2: Add config/client timeout/error/logging and health check.
- [x] Step 3: Add payload builders and validation.
- [x] Step 4: Update mock and tests.
- [x] Step 5: Update docs and run verification.

## Surprises & Discoveries

- Current sync sends every operation to `/api/resource/Awamir Placeholder`; R19 must replace this with doctype-specific payloads while preserving the outbox contract.
- Current schema already has enough references for R19; no migration is expected.

## Decision Log

- Use backend env defaults for staging ERPNext company, customer fallback, warehouse, and accounts instead of adding mapping tables in this task.
- Keep submit invoice/payment under accounting settings and service boundaries.
- Treat existing local ERPNext references as idempotent success for duplicate outbox processing.

## Outcome

Implemented. ERPNext staging configuration is now backend-env driven with staging/production validation, timeout handling, structured timing logs, safe error classification, and optional readiness visibility. The sync worker now builds real ERPNext Sales Order, draft Sales Invoice, and draft Payment Entry requests through `ERPNextSyncService`/`ERPNextClient`, validates required references before HTTP, preserves local idempotency, and stores references only through the sync boundary. The ERPNext mock and tests cover validation, timeout, duplicate prevention, retry/dead-letter preservation, and non-rollback behavior.

Verification completed:
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`

Boundary scans completed:
- No ERPNext imports exist inside `apps/api/src/payments`.
- No ERPNext imports exist inside `apps/api/src/cashboxes`.
- No ERPNext references exist inside `apps/mobile`.
