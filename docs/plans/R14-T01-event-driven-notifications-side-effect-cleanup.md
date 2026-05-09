# R14-T01 Event-Driven Notifications And Side-Effect Cleanup

## Purpose / Big Picture

Normalize side effects behind typed in-process domain events so future Flutter MVP work does not add more direct notification, audit, tracing, or optional outbox side effects inside domain services.

## Scope

Included: in-process event bus, typed core events, audit/notification/tracing handlers, key service emissions for orders/payments/ERPNext sync, tests, and boundary checks.

Excluded: external brokers, durable event store, moving critical state mutations into handlers, Flutter changes.

## Files Expected To Change

- `apps/api/src/domain-events/*`
- selected services in orders, payments, erpnext
- `apps/api/src/app.module.ts`
- unit/e2e tests

## Data Model Changes

None planned.

## API Changes

None planned.

## State Transitions

No state transition behavior changes. State mutations remain in existing services/transactions.

## Authorization

No permission changes.

## Idempotency

Handlers dedupe side effects where duplicate handling could create duplicate audit/notification/outbox records.

## Audit Logs

Central audit handler writes audit logs with correlation id in payload for supported events.

## Tests

- Event bus dispatch.
- Order approval emits event.
- Payment collection emits event.
- ERPNext sync failure emits event.
- Audit handler writes correlation id.
- Notification handler writes centrally.
- Duplicate handler execution does not duplicate idempotent side effects.
- Payments/Cashboxes ERPNext import boundary check.

## Acceptance Criteria

- [ ] Services emit domain events for key side effects.
- [ ] Audit logs are centralized for supported events.
- [ ] Notifications are centralized for supported events.
- [ ] Existing e2e behavior passes.
- [ ] Correlation id propagates.
- [ ] No circular Nest dependencies.

## Progress

- [x] Step 1: Plan approved.
- [x] Step 2: DomainEvents infrastructure implemented.
- [x] Step 3: Handlers implemented.
- [x] Step 4: Services emit events.
- [x] Step 5: Tests and verification completed.

## Surprises & Discoveries

Pending implementation.

## Decision Log

- Keep event bus in-process and best-effort.
- Do not import ERPNext into Payments/Cashboxes.
- Keep ERPNext reference/status updates in `ERPNextSyncService`.

## Outcome

Implemented and verified. Domain events now cover key order, payment, and ERPNext sync side effects; audit/notification handlers centralize supported side effects with correlation ids; handler failures are logged by the in-process bus without rolling back committed state.
