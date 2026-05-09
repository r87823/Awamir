# R16-T01 Hardening, Observability, Consistency, And Production Readiness

## Purpose / Big Picture

Stabilize the backend before Flutter MVP by adding platform-level request tracing, structured logging, unified API errors, pagination normalization, readiness checks, retry/dead-letter verification, and architecture documentation without changing operational behavior.

## Scope

Included: backend observability, request/correlation propagation, API error normalization, pagination helpers, state/retry review, health/readiness, OpenAPI setup, focused tests, and architecture docs.

Excluded: Flutter changes, new business workflows, external brokers/infrastructure, direct ERPNext calls outside `ERPNextClient`, and moving critical state mutations into async handlers.

## Files Expected To Change

- `apps/api/src/observability/*`
- `apps/api/src/common/pagination.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/health/health.controller.ts`
- selected service/controller files in orders, fulfillment, delivery, payments, cashboxes, accounting, erpnext, and domain-events
- focused unit/e2e tests
- architecture docs

## Data Model Changes

No schema changes planned initially. Indexes will be reviewed and only added if a current query path is clearly unsupported.

## API Changes

- Add request/response tracing headers: `x-request-id`, `x-correlation-id`.
- Standardize error bodies as `{ code, message, details, correlationId, timestamp }`.
- Expand health/readiness payload with DB, Redis, worker, and ERPNext outbox lag.
- Add Swagger/OpenAPI setup for the existing API surface.

## State Transitions

No behavior changes. Existing order, work order, cashbox, accounting, and ERP retry transition helpers remain authoritative. Delivery batch transitions will be reviewed and routed through a small helper if needed without changing allowed transitions.

## Authorization

No permission changes. New or documented endpoints follow existing permission metadata patterns where sensitive.

## Idempotency

Existing idempotency remains unchanged for order approval, work-order split, delivery batching, payment collection, ERPNext outbox, accounting retry, and cashbox/financial close. Retry/dead-letter behavior will be verified.

## Audit Logs

Central domain-event audit behavior remains in place. The pass will add request correlation to audit/event paths where safe and avoid duplicate audit creation.

## Tests

- Correlation ID propagation.
- Standardized error shape.
- Invalid transition consistency.
- Retry/dead-letter consistency.
- Pagination normalization.
- Request logging interceptor.
- Health/readiness response shape.
- Swagger document creation.
- ERPNext import boundary checks for payments/cashboxes.

## Acceptance Criteria

- [ ] Existing tests pass.
- [ ] Standardized errors/logging implemented.
- [ ] Request tracing works end-to-end.
- [ ] State mutation boundaries reviewed.
- [ ] Pagination standardized.
- [ ] Indexes reviewed.
- [ ] Swagger/OpenAPI loads.
- [ ] Health/readiness expanded.
- [ ] No circular dependencies.
- [ ] Payments/Cashboxes remain ERPNext-import-free.
- [ ] No raw `console.log` remains in production paths.

## Progress

- [x] Step 1: Plan approved.
- [x] Step 2: Initial repo/schema/module review completed.
- [x] Step 3: Observability and request context implemented.
- [x] Step 4: Error and pagination standardization implemented.
- [x] Step 5: Health/OpenAPI/docs implemented.
- [x] Step 6: Tests and verification completed.

## Surprises & Discoveries

- Swagger dependencies were not present even though OpenAPI is a project contract.
- `main.ts` had no global pipes, filters, interceptors, or Swagger setup.
- Pagination normalization was duplicated across multiple services.
- `DeliveryStatus.READY` is present and used as production/packing complete, while delivery batching uses `WAITING_BATCH`.
- Existing Prisma indexes already cover the main high-risk queues: order branch/status, accounting status, cashbox business date/status, delivery destination/status, driver/status, work-order production center/department, and outbox status/next retry.

## Decision Log

- Add a small in-process observability layer instead of external infrastructure.
- Preserve existing operational behavior and e2e expectations.
- Keep ERPNext boundaries from R13/R14 intact.
- Add schema changes only if index review finds a concrete need.
- Do not add schema/index changes in R16 because the current acceptance paths are covered by existing indexes and the task command list made migration conditional.

## Outcome

Implemented and verified. R16 added centralized request context, structured logging, API error normalization, pagination normalization, OpenAPI setup, health/readiness checks, delivery batch state-machine consistency, request correlation propagation into events/outbox, retry/dead-letter tests, and architecture documentation. No Prisma schema changes were made.

Verification completed with format, Prisma generation, lint, typecheck, unit tests, e2e tests, ERPNext import boundary scans for Payments/Cashboxes, direct ERPNext HTTP scan, and raw production `console.*` scan.
