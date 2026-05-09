# ERPNext Sync Lifecycle

ERPNext synchronization uses an outbox and retryable sync logs.

The normal lifecycle is:

1. Accounting or an approved operational setting creates an idempotent `IntegrationOutbox` row.
2. The worker processes due outbox rows with status `PENDING` or `FAILED` and `nextRetryAt <= now`.
3. `ERPNextClient` performs the only direct ERPNext HTTP calls.
4. `ERPNextSyncLog` stores safe redacted request and response payloads.
5. Success stores ERPNext references and updates accounting status only.
6. Failure stores a failed log, updates sync/accounting failure state where applicable, and emits an ERPNext sync failure event.

Retry backoff:

- retry 1: 1 minute
- retry 2: 5 minutes
- retry 3: 15 minutes
- retry 4: 1 hour
- retry 5: `DEAD_LETTER`

`DEAD_LETTER` rows are not processed by the normal due-outbox worker scan.
