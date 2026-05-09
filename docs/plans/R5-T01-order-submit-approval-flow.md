# R5-T01 Order Submit And Approval Flow ExecPlan

## Purpose / Big Picture

Awamir Plus will support the first approval workflow for orders: branch operators submit draft orders, branch supervisors approve/reject/return scoped pending orders, approved orders appear in a fulfillment queue, and optional ERPNext Sales Order outbox enqueue happens after approval without blocking Awamir operations.

## Scope

Included:
- Submit for approval endpoint.
- Approve endpoint.
- Reject endpoint with required reason.
- Return for edit endpoint with required notes.
- Fulfillment queue query for approved orders.
- Optional ERPNext Sales Order outbox enqueue when enabled.
- Audit logs and notification records.
- Tests for transitions, scope, required fields, idempotency, and optional outbox behavior.

Excluded:
- Real ERPNext document creation.
- Full notification delivery channels.
- Flutter changes.
- Fulfillment execution.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/orders/*`
- `apps/api/test/orders.e2e-spec.ts`
- `docs/plans/R5-T01-order-submit-approval-flow.md`

## Data Model Changes

- Add `REJECTED` to `OrderStatus`.
- Add order workflow metadata fields: submitted/approved/rejected/returned timestamps, rejection reason, return notes.
- Add `notifications` table for lightweight workflow notifications.

## API Changes

Routes:
- `POST /orders/:id/submit-for-approval`
- `POST /orders/:id/approve`
- `POST /orders/:id/reject`
- `POST /orders/:id/return-for-edit`
- `GET /orders/fulfillment-queue`

Error codes:
- `REJECTION_REASON_REQUIRED`
- `RETURN_NOTES_REQUIRED`
- existing `INVALID_STATUS_TRANSITION`
- existing `BRANCH_SCOPE_FORBIDDEN`

## State Transitions

- `DRAFT -> submit -> PENDING_APPROVAL`
- `RETURNED_FOR_EDIT -> submit -> PENDING_APPROVAL`
- `PENDING_APPROVAL -> approve -> APPROVED`
- `PENDING_APPROVAL -> reject -> REJECTED`
- `PENDING_APPROVAL -> return_for_edit -> RETURNED_FOR_EDIT`

Approval is idempotent: approving an already approved order returns the approved order and does not duplicate ERPNext outbox.

## Authorization

Permissions:
- `orders:submit` for branch operators submitting scoped draft/returned orders.
- `orders:approve` for branch supervisors approving scoped branch orders.
- `orders:reject` for rejection.
- `orders:return_for_edit` for returning.
- `orders:view` / `orders:view_branch` for fulfillment queue.

Branch scope uses `x-branch-id` and existing permission metadata. No role checks.

## Idempotency

- Approval idempotency is enforced by current status and ERPNext outbox unique idempotency key.
- ERPNext Sales Order enqueue uses `erpnext:sales_order:{orderId}`.

## Audit Logs

Actions:
- `order.submitted_for_approval`
- `order.approved`
- `order.rejected`
- `order.returned_for_edit`
- `order.erpnext_enqueue_failed`

## Tests

- Draft to pending approval.
- Pending approval to approved.
- Reject requires reason.
- Return for edit requires notes.
- Branch supervisor cannot approve another branch order.
- Approval is idempotent.
- Approval creates ERPNext outbox only when enabled.
- Approval does not fail if ERPNext enqueue fails and logs failure.
- Fulfillment queue returns approved orders.

## Acceptance Criteria

- [x] `DRAFT -> PENDING_APPROVAL`
- [x] `PENDING_APPROVAL -> APPROVED`
- [x] `PENDING_APPROVAL -> REJECTED` requires reason
- [x] `PENDING_APPROVAL -> RETURNED_FOR_EDIT` requires notes
- [x] Approval creates ERPNext outbox only when setting enabled

## Progress

- [x] Step 1: Plan R5-T01.
- [x] Step 2: Add schema changes and migration.
- [x] Step 3: Implement services/endpoints.
- [x] Step 4: Add tests.
- [x] Step 5: Verify and update outcome.

## Surprises & Discoveries

- `GET /orders/fulfillment-queue` would conflict with the existing `GET /orders/:id` route in Nest/Express routing, so the fulfillment queue endpoint is `GET /orders/fulfillment/queue`.

## Decision Log

- Use `ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER=true` as the feature setting for optional ERPNext outbox enqueue in this foundation stage.
- Notifications are stored as database records; delivery channels are outside this task.
- Approval catches ERPNext enqueue errors, logs `order.erpnext_enqueue_failed`, and still returns the approved order.

## Outcome

Completed and verified. R5 adds submit, approve, reject, return-for-edit, fulfillment queue, notification records, optional ERPNext Sales Order outbox enqueue, idempotent approval behavior, and tests for the acceptance criteria.

Verification run:
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm prisma:migrate:dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
