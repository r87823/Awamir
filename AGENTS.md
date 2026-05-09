# Awamir Plus - Codex Instructions

## Product Rule

Awamir Plus is an independent operations platform.

Architecture:

Flutter App -> Awamir Plus Backend -> ERPNext REST API

Never connect Flutter directly to ERPNext.
Never place ERPNext credentials in Flutter.
Awamir Plus owns operational workflow.
ERPNext owns accounting, stock, financial documents, and official financial reports.

## Tech Stack

- Backend: NestJS + TypeScript
- DB: PostgreSQL
- ORM: Prisma
- Queue: Redis + BullMQ
- Mobile: Flutter
- API contract: OpenAPI
- Tests: Jest, Supertest, Testcontainers
- Package manager: pnpm

## Required Commands

Before finalizing backend changes, run:

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e when API behavior changes
- pnpm prisma:migrate:dev when schema changes
- pnpm prisma:generate after Prisma schema changes

Before finalizing Flutter changes, run:

- flutter analyze
- flutter test
- dart format .

## Architecture Rules

- Controllers must be thin.
- Business rules live in domain services.
- Authorization must use permissions and policies, not direct role checks.
- Do not write `if role == "driver"` for protected actions.
- Use `hasPermission`, policy classes, and scope filters.
- Every protected endpoint must declare required permission metadata.
- Every sensitive mutation must create an audit log.
- Status changes must go through state transition services.
- Do not update order/work_order/delivery/payment statuses directly from controllers.
- ERPNext calls must go through ERPNextSyncService or ERPNextClient.
- ERPNext sync must use outbox + retryable sync logs.
- Operations must continue if ERPNext sync fails.

## Data Rules

- Use soft delete for operational records.
- Use idempotency for create/approve/split/batch/payment/ERPNext sync actions.
- Use optimistic locking with version fields on critical records.
- Store snapshots for customer/order item names and prices.
- Store ERPNext references but do not treat ERPNext as operational workflow owner.

## Testing Rules

Every feature must include:

- unit tests for domain logic
- permission tests
- scope tests
- status transition tests
- idempotency tests for sensitive mutations
- integration tests for APIs
- e2e test for full vertical flow when relevant

## Review Guidelines

Focus on:

- permission bypass
- direct role checks
- missing branch/department scope filters
- invalid state transitions
- non-idempotent mutations
- missing audit logs
- ERPNext credentials leakage
- Flutter calling ERPNext directly
- payment/accounting inconsistencies
- race conditions
- missing tests