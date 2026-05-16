# R19-T03 Fix ERPNext Outbox Worker Wakeup

## Purpose / Big Picture

R19-T02 real staging verification exposed a queue wakeup gap: accounting sync created due `IntegrationOutbox` rows with status `PENDING`, but the worker did not receive a BullMQ job until `process-due` was manually queued.

R19-T03 fixed the wakeup path while preserving the outbox/retry/dead-letter architecture. Request paths still do not call ERPNext directly. The API container only schedules queue jobs; the worker container remains responsible for processing.

## Scope

Included:

- Central ERPNext queue scheduler/wakeup helper.
- Automatic `process-due` job scheduling when an ERPNext outbox item is created, retried, or moved into retry after failure.
- Future retry scheduling based on `nextRetryAt`.
- Dead-letter skip behavior.
- Structured logs for wakeup scheduled/skipped/failed.
- Unit and accounting e2e coverage for enqueue/retry wakeup behavior.

Excluded:

- Flutter changes.
- ERPNext payload mapping changes.
- Direct ERPNext calls from request paths.
- Changes to Payments/Cashboxes ERPNext boundaries.

## Outcome

Implementation completed:

- `ERPNextQueueScheduler` creates BullMQ `process-due` jobs from the API container without starting a worker there.
- `ERPNextSyncWorker` and the scheduler share the same queue/job constants.
- `ERPNextSyncService` schedules wakeups for new, existing idempotent, retried, and failed outbox items.
- Failed worker attempts increment retry count and schedule backoff until `DEAD_LETTER`.
- BullMQ job IDs were changed to avoid invalid `:` characters.

Staging verification completed:

- A new smoke test ran without manually adding `process-due`.
- Sales Order sync moved automatically from `PENDING` to `SUCCEEDED`.
- Sales Invoice sync moved automatically from `PROCESSING` to `SUCCEEDED`.
- Payment Entry reached the worker automatically.
- Payment Entry retry/backoff scheduling worked and a delayed BullMQ job was created.

Observed remaining issue:

- The Payment Entry staging smoke later failed with ERPNext `duplicate_document`.
- This is not a worker wakeup failure. It proves the outbox was processed and retried by the worker.

Follow-up:

- Improve `duplicate_document` handling for Payment Entry by looking up and storing an existing ERPNext Payment Entry reference when safe, or make staging smoke payment idempotency unique enough to avoid ERPNext duplicate constraints.

Final R19-T03 status: completed.
