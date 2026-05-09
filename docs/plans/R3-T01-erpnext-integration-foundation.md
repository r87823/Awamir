# R3-T01 ERPNext Integration Foundation ExecPlan

## Purpose / Big Picture

Awamir Plus will have a backend-only ERPNext integration foundation. Operational actions can enqueue idempotent sync work, workers can send safe placeholder ERPNext requests, failures are logged and retryable, and ERPNext outages do not roll back Awamir operations.

## Scope

Included:
- Prisma models for ERPNext integration config, sync logs, and integration outbox.
- Backend-only ERPNext client reading credentials from env/config.
- ERPNext sync service with minimal placeholder contracts.
- BullMQ worker that respects `next_retry_at`.
- Retry endpoint for failed/pending outbox work.
- Safe request/response logging with secret redaction.
- `apps/erpnext-mock` for tests.
- Tests covering mock validation, failure logs, retry count, worker timing, redaction, and duplicate idempotency.

Excluded:
- Real ERPNext dependency in tests.
- Real order/payment table integration.
- Flutter changes.
- Full ERPNext document payload mapping.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/erpnext/*`
- `apps/api/src/app.module.ts`
- `apps/api/package.json`
- `apps/api/test/*`
- `apps/erpnext-mock/*`
- `pnpm-workspace.yaml`

## Data Model Changes

Tables:
- `erpnext_integration_configs`: backend-only ERPNext URL/API key/secret config metadata.
- `erpnext_sync_logs`: per sync attempt logs with redacted request/response payloads.
- `integration_outbox`: idempotent queued sync operations with retry state.

Enums:
- `ERPNextSyncOperation`
- `ERPNextSyncStatus`

Constraints:
- Unique active integration config.
- Unique outbox `idempotency_key`.
- Indexes on outbox status and `next_retry_at`.
- Indexes on sync logs by outbox and status.

## API Changes

Routes:
- `POST /erpnext/validate-connection`
- `POST /erpnext/sync/:outboxId/retry`

Error codes:
- `ERPNEXT_OUTBOX_NOT_FOUND`

## State Transitions

Outbox:
- `PENDING -> PROCESSING -> SUCCEEDED`
- `PENDING -> PROCESSING -> FAILED`
- `FAILED -> PENDING` via retry endpoint
- `PENDING` remains unchanged when `next_retry_at` is in the future
- `SUCCEEDED` remains unchanged on duplicate/idempotent attempts

## Authorization

ERPNext admin endpoints require `erpnext-sync:manage`.
No direct role checks are introduced.

## Idempotency

Every operation uses a deterministic idempotency key:
- `erpnext:sales_order:{orderId}`
- `erpnext:draft_sales_invoice:{orderId}`
- `erpnext:submit_sales_invoice:{orderId}`
- `erpnext:draft_payment_entry:{paymentId}`
- `erpnext:submit_payment_entry:{paymentId}`

Duplicate keys reuse the same outbox row and do not send duplicate ERPNext documents once succeeded or already processing.

## Audit Logs

No financial/operational mutation is executed here. Sync attempts are recorded in `erpnext_sync_logs`; retry scheduling is represented on the outbox row.

## Tests

- Unit tests for redaction.
- Unit tests for service idempotency and worker timing.
- E2E/integration tests against `apps/erpnext-mock` for validate connection and failed request logging.
- Retry endpoint test verifies `retry_count` increments.

## Acceptance Criteria

- [x] Validate connection test with mock ERPNext.
- [x] Failed request creates sync log failed.
- [x] Retry increments `retry_count`.
- [x] Worker respects `next_retry_at`.
- [x] Duplicate outbox key does not duplicate ERPNext document.
- [x] Safe redaction covers `api_secret` and authorization data.

## Progress

- [x] Step 1: Plan R3-T01.
- [x] Step 2: Add Prisma schema and migration.
- [x] Step 3: Implement client, service, worker, retry endpoint.
- [x] Step 4: Add mock ERPNext app and tests.
- [x] Step 5: Run verification and update outcome.

## Surprises & Discoveries

- Existing Prisma is pinned to 6.19.0 because Prisma 7 requires the newer datasource config flow.
- E2E tests use a shared development database, so ERPNext e2e tests run in band to avoid cross-test cleanup races.

## Decision Log

- Placeholder document contracts will only send document type, source id, and idempotency key.
- Tests will use the local mock server only; no real ERPNext dependency.
- The BullMQ worker is opt-in with `ERPNEXT_WORKER_ENABLED=true`; tests and default local API startup do not open worker Redis handles unexpectedly.

## Outcome

Completed and verified. The backend now has ERPNext integration config, sync log, and outbox models; a backend-only ERPNext client; idempotent placeholder sync contracts; a BullMQ worker; safe redaction; retry endpoint; and a local ERPNext mock app for integration tests.

Verification run:
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm prisma:migrate:dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
