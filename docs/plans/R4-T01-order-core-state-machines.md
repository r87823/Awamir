# R4-T01 Order Core And State Machines ExecPlan

## Purpose / Big Picture

Awamir Plus will support core order drafts with item/customer snapshots, calculated totals, scoped viewing, optimistic locking, and status transitions governed by a domain state machine.

## Scope

Included:
- `orders` and `order_items` Prisma models.
- Order, production, delivery, payment, and accounting status enums.
- Order number generator.
- DTO types.
- Order service for create draft, update draft, view, and filter with pagination.
- Order state machine.
- Branch scope checks for `orders:view_branch`.
- Audit logs for create/update.
- Unit and e2e tests.

Excluded:
- Approval workflow endpoints beyond state-machine validation.
- ERPNext sync triggers.
- Fulfillment split execution.
- Payment collection.
- Flutter changes.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/orders/*`
- `apps/api/src/app.module.ts`
- `apps/api/test/orders.e2e-spec.ts`

## Data Model Changes

Tables:
- `orders`: branch relation, order number, customer snapshot fields, independent status columns, totals, optimistic locking version, soft delete.
- `order_items`: order/product relation, ERPNext item code snapshot, item name snapshot, quantity, unit price, line total, soft delete.

Enums:
- `OrderStatus`
- `ProductionStatus`
- `DeliveryStatus`
- `PaymentStatus`
- `AccountingStatus`

Indexes:
- Order number unique.
- Branch/status/created date indexes for filter and pagination.
- Order item order/product indexes.

## API Changes

Routes:
- `POST /orders`
- `PATCH /orders/:id`
- `GET /orders/:id`
- `GET /orders`
- `POST /orders/:id/transitions/:action`

Error codes:
- `ORDER_NOT_FOUND`
- `ORDER_EDIT_NOT_ALLOWED`
- `ORDER_VERSION_CONFLICT`
- `INVALID_STATUS_TRANSITION`
- `BRANCH_SCOPE_FORBIDDEN`

## State Transitions

Order status:
- `DRAFT -> submit -> PENDING_APPROVAL`
- `PENDING_APPROVAL -> approve -> APPROVED`
- `PENDING_APPROVAL -> return_for_edit -> RETURNED_FOR_EDIT`
- `RETURNED_FOR_EDIT -> submit -> PENDING_APPROVAL`
- `APPROVED -> cancel -> CANCELLED`

Draft editing is allowed only when status is `DRAFT` or `RETURNED_FOR_EDIT`.

## Authorization

Permissions:
- `orders:create`
- `orders:update`
- `orders:view`
- `orders:view_branch`

Branch-scoped users with `orders:view_branch` must provide `x-branch-id` and can only view/list orders in that branch. No direct role checks are introduced.

## Idempotency

No idempotent workflow mutation is introduced in R4-T01. Optimistic locking prevents lost updates on order edits.

## Audit Logs

Audit actions:
- `order.created`
- `order.updated`
- `order.status_transitioned`

## Tests

- Unit tests for state transitions.
- Unit tests for totals.
- E2E tests for create draft, edit restriction, invalid transition, branch scope, totals, pagination/filter, optimistic locking, and audit logs.

## Acceptance Criteria

- [x] Can create draft order.
- [x] Cannot edit `PENDING_APPROVAL`.
- [x] Invalid transition returns `INVALID_STATUS_TRANSITION`.
- [x] Branch user cannot view another branch order.
- [x] Order totals calculate correctly.

## Progress

- [x] Step 1: Plan R4-T01.
- [x] Step 2: Add Prisma schema and migration.
- [x] Step 3: Implement order service, state machine, controller.
- [x] Step 4: Add tests.
- [x] Step 5: Run verification and update outcome.

## Surprises & Discoveries

- Local sandbox blocks Flutter SDK cache access and localhost service binding, so `pnpm format`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm prisma:migrate:dev` needed escalation where they touched those resources.

## Decision Log

- Use permission metadata and headers for bootstrap authorization/scope, consistent with existing code.
- Keep order status transitions minimal until approval/fulfillment/payment workflows are implemented.
- Controllers expose transition actions, but the next status is always decided by `OrderStateMachine`.

## Outcome

Completed and verified. Orders and order items now support draft creation, draft/returned-for-edit updates, state-machine transitions, branch-scoped viewing, pagination/filtering, optimistic locking, snapshot fields, totals, and audit logs.

Verification run:
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm prisma:migrate:dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
