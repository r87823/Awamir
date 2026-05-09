# Awamir Plus Execution Plans

Codex must use an ExecPlan for any task that changes:
- database schema
- state machines
- RBAC
- ERPNext sync
- payments
- cashbox
- accounting
- delivery batching
- production aggregation

Each ExecPlan must include:

## Purpose / Big Picture

What user-visible or system-visible behavior will exist after this change.

## Scope

Exactly what is included.
Exactly what is excluded.

## Files Expected To Change

List expected directories and key files.

## Data Model Changes

Tables, fields, indexes, unique constraints, foreign keys, enums.

## API Changes

Routes, permissions, request DTOs, response DTOs, error codes.

## State Transitions

Allowed from -> action -> to transitions.

## Authorization

Required permissions and scope rules.

## Idempotency

Idempotency key format and duplicate behavior.

## Audit Logs

Audit action names and payload.

## Tests

Unit, integration, e2e tests required.

## Acceptance Criteria

Checklist.

## Progress

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Surprises & Discoveries

Record unexpected findings with evidence.

## Decision Log

Record decisions and rationale.

## Outcome

What was completed, what remains, and how it was verified.