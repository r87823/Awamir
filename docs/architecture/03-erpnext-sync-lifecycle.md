# ERPNext Sync Lifecycle

ERPNext synchronization uses an outbox and retryable sync logs.

The normal lifecycle is:

1. Accounting or an approved operational setting creates an idempotent `IntegrationOutbox` row.
2. The worker processes due outbox rows with status `PENDING` or `FAILED` and `nextRetryAt <= now`.
3. `ERPNextSyncService` builds and validates the ERPNext payload from Awamir snapshots and references.
4. `ERPNextClient` performs the only direct ERPNext HTTP calls.
5. `ERPNextSyncLog` stores safe redacted request and response payloads.
6. Success stores ERPNext references and updates accounting status only.
7. Failure stores a failed log, updates sync/accounting failure state where applicable, and emits an ERPNext sync failure event.

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
