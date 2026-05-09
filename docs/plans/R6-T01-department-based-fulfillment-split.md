# R6-T01 Department-Based Fulfillment Split ExecPlan

## Purpose / Big Picture

Approved orders can be split into department work orders grouped by production center and department. The operation is idempotent, validates all item mappings before creating any work orders, and provides a fulfillment queue for coordinators.

## Scope

Included:
- `work_orders` and `work_order_items` Prisma models.
- Production center support on item department mappings.
- Department split service grouped by `production_center_id + department_id`.
- Missing mapping validation before creation.
- Idempotency key `create_department_work_orders:{order_id}`.
- Fulfillment queue endpoint.
- Split endpoint protected by `fulfillment_coordinator`.
- Audit logs.
- Tests.

Excluded:
- Work order execution state transitions beyond creation.
- Production scheduling.
- Delivery/payment/accounting changes.
- Flutter changes.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/fulfillment/*`
- `apps/api/src/master-data/*`
- `apps/api/test/fulfillment.e2e-spec.ts`

## Data Model Changes

Tables:
- `work_orders`: order, production center, department, status, idempotency key, soft delete.
- `work_order_items`: work order, order item, product snapshot fields, quantity.

Changed:
- `item_department_mappings.production_center_id` links product mappings to a production center.

Constraints:
- Unique `work_orders.idempotency_key`.
- Unique `work_orders(order_id, production_center_id, department_id)` prevents duplicate work orders for the same order/department group.

## API Changes

Routes:
- `GET /fulfillment/queue`
- `POST /fulfillment/orders/:orderId/split-by-department`

Error codes:
- `MISSING_DEPARTMENT_MAPPING`
- `DEPARTMENT_OVERRIDE_NOT_ALLOWED`

## State Transitions

No new status transition flow is introduced. Work orders are created in `OPEN` status.

## Authorization

Only requests with `fulfillment_coordinator` permission can split an order. Queue view uses `orders:view`.

## Idempotency

Split operation uses batch key `create_department_work_orders:{order_id}`. If work orders already exist for the order, the service returns them and creates no duplicates.

## Audit Logs

Actions:
- `fulfillment.department_work_orders.created`
- `fulfillment.department_work_orders.reused`
- `fulfillment.department_work_orders.blocked_missing_mapping`

## Tests

- Order with cake and pastry creates two work orders.
- Missing mapping blocks operation with `MISSING_DEPARTMENT_MAPPING` and creates no work orders.
- Second split request returns existing work orders without duplicates.
- Order links to all work orders.
- Split requires `fulfillment_coordinator`.

## Acceptance Criteria

- [x] Order with cake and pastry creates two work orders.
- [x] Missing mapping blocks operation with `MISSING_DEPARTMENT_MAPPING`.
- [x] Second split request returns existing result, no duplicates.
- [x] Order links to all work orders.

## Progress

- [x] Step 1: Plan R6-T01.
- [x] Step 2: Add schema and migration.
- [x] Step 3: Implement split service and endpoints.
- [x] Step 4: Add tests.
- [x] Step 5: Verify and update outcome.

## Surprises & Discoveries

- E2E fixtures must keep branch codes short because order numbers embed branch code and `orders.order_number` is limited to 40 chars.

## Decision Log

- `ALLOW_DEPARTMENT_OVERRIDE=true` is the bootstrap setting for override behavior. When disabled, override payloads are rejected.
- Existing work orders for an order are treated as the idempotent result.

## Outcome

Implemented and verified. Added work order persistence, department split service, fulfillment queue endpoint, protected split endpoint, audit logs, and R6 e2e coverage.
