# Awamir Plus Executive Architecture

Awamir Plus is an independent operations platform for order, delivery, production, payment, and operational workflows.

The system boundary is:

```text
Flutter App -> Awamir Plus Backend -> ERPNext REST API
```

The Flutter app never connects directly to ERPNext and never contains ERPNext credentials. Awamir Plus owns operational workflow, authorization, idempotency, auditing, state transitions, and API contracts. ERPNext owns accounting, stock, financial documents, and official financial reports.

## Monorepo Layout

- `apps/api`: NestJS TypeScript backend.
- `apps/mobile`: Flutter mobile application.
- `packages/shared`: Shared TypeScript contracts and utilities that are safe for internal packages.
- `packages/api-client`: TypeScript API client package for Awamir Plus backend APIs.
- `docs/architecture`: Architecture notes and decision records.

## Runtime Dependencies

Local development uses Docker Compose for PostgreSQL and Redis. PostgreSQL is the operational data store. Redis supports queue infrastructure such as BullMQ when workflow features are introduced.

## Backend Module Boundary

The backend is organized around operational modules: orders, fulfillment, delivery, payments, cashboxes, accounting, ERPNext sync, and domain events. Controllers stay thin, permissions are expressed through endpoint metadata, and business rules live in services/state helpers.

ERPNext integration is intentionally isolated. Payments and Cashboxes do not import ERPNext modules or clients. Accounting may enqueue sync through `ERPNextSyncService`, and actual HTTP calls stay inside `ERPNextClient`.

## Observability And API Contract

Every request receives a request id and correlation id. If the caller sends `x-request-id` or `x-correlation-id`, the backend propagates those values; otherwise it generates them and returns both headers.

API errors use a stable shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": {},
  "correlationId": "corr_...",
  "timestamp": "2026-05-10T00:00:00.000Z"
}
```

Structured logs carry request/correlation ids, actor id when available, module, event, status, and duration. Secrets, tokens, passwords, API keys, and ERPNext API secrets are redacted before logging or returning normalized error details.

OpenAPI is exposed at `/docs` for the backend API contract.

## Health And Readiness

`GET /health` and `GET /health/ready` report API status plus database, Redis, worker, and ERPNext outbox lag checks. `GET /health/live` reports process liveness only.

Readiness can be `ok` or `degraded`; degraded readiness is explicit operational signal and does not hide which dependency needs attention.

## Status Semantics

Operational workflow statuses remain owned by Awamir Plus state helpers.

For delivery, `DeliveryStatus.READY` means production/packing is complete. `DeliveryStatus.WAITING_BATCH` is the explicit delivery batching eligibility status. Delivery batching must use `WAITING_BATCH`; it must not infer eligibility from the broader word "ready".
