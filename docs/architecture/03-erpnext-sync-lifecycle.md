# ERPNext Sync Lifecycle

ERPNext synchronization uses an outbox and retryable sync logs.

The normal lifecycle is:

1. Accounting or an approved operational setting creates an idempotent `IntegrationOutbox` row.
2. The API-side ERPNext queue scheduler adds or delays a BullMQ `process-due` wakeup job. The API container does not run the worker.
3. The worker container processes due outbox rows with status `PENDING` or `FAILED` and `nextRetryAt <= now`.
4. `ERPNextSyncService` builds and validates the ERPNext payload from Awamir snapshots and references.
5. `ERPNextClient` performs the only direct ERPNext HTTP calls.
6. `ERPNextSyncLog` stores safe redacted request and response payloads.
7. Success stores ERPNext references and updates accounting status only.
8. Failure stores a failed log, updates sync/accounting failure state where applicable, emits an ERPNext sync failure event, increments retry state, and schedules the next wakeup unless the outbox reaches `DEAD_LETTER`.

R19 real staging sync creates these ERPNext documents through REST:

- `Sales Order` from approved order/customer/item snapshots.
- Draft `Sales Invoice` from order/customer/item snapshots.
- Draft `Payment Entry` from reviewed payments and configured payment accounts.

Submit operations use `frappe.client.submit` through the same outbox path. Accounting settings decide whether submit outboxes are created; ERP sync success never mutates operational workflow status.

Validation happens before outbound HTTP. Standard sync error codes are:

- `validation_failed`
- `connection_failed`
- `duplicate_document`
- `missing_item_code`
- `missing_account`
- `timeout`

Retry backoff:

- retry 1: 1 minute
- retry 2: 5 minutes
- retry 3: 15 minutes
- retry 4: 1 hour
- retry 5: `DEAD_LETTER`

`DEAD_LETTER` rows are not processed by the normal due-outbox worker scan.

Idempotency is enforced at two layers: a stable Awamir outbox idempotency key, and an `Idempotency-Key` header on outbound ERPNext requests. If a local ERPNext reference already exists for a create operation, the outbox is treated as idempotently succeeded without creating another ERPNext document.

## R19 Staging Outcome

R19-T02 real ERPNext staging verification completed successfully:

- Sales Order: `SAL-ORD-2026-00002`
- Sales Invoice: `ACC-SINV-2026-00001`
- Payment Entry: `ACC-PAY-2026-00001`
- Awamir stored the ERPNext references.
- `order.accountingStatus` became `ACCOUNTING_POSTED`.
- `payment.status` became `POSTED`.

R19-T03 worker wakeup verification completed successfully:

- A smoke test without manual `process-due` showed Sales Order and Sales Invoice sync automatically.
- Payment Entry reached the worker automatically.
- Retry/backoff scheduling worked.
- The remaining Payment Entry smoke issue was ERPNext staging `duplicate_document`, not worker wakeup.

Follow-up:

- Improve `duplicate_document` handling for Payment Entry by looking up and storing an existing ERPNext reference when safe, or make smoke payment idempotency unique enough to avoid ERPNext duplicate constraints.
