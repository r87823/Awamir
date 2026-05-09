# R2-T01 Master Data Foundation ExecPlan

## Purpose / Big Picture

Awamir Plus will have operational master data for branches, production centers, departments, ERPNext item cache records, and item-to-department mappings. Admin users can maintain this data through protected backend endpoints. Fulfillment split validation will reject products without an active department mapping.

## Scope

Included:
- Prisma schema for master data and audit logs.
- Seed data with Arabic names and English codes.
- Admin CRUD endpoints for branches, production centers, departments, products, and item department mappings.
- Permission metadata and guard for protected admin endpoints.
- Product local cache fields including `erpnext_item_code`.
- Domain validation for missing active item-department mappings.
- Unit and e2e tests.

Excluded:
- Flutter changes.
- ERPNext API calls or sync.
- Order creation, fulfillment split creation, delivery batching, or production workflows.
- Full user/session authentication.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/prisma/*`
- `apps/api/src/auth/*`
- `apps/api/src/audit/*`
- `apps/api/src/master-data/*`
- `apps/api/src/fulfillment/*`
- `apps/api/src/app.module.ts`
- `apps/api/package.json`
- `apps/api/test/*`
- `docs/plans/R2-T01-master-data-foundation.md`

## Data Model Changes

Tables:
- `branches`: code, Arabic/English names, active flag, soft delete, version.
- `production_centers`: branch relation, code, Arabic/English names, active flag, soft delete, version.
- `departments`: code, Arabic/English names, active flag, soft delete, version.
- `products`: code, Arabic/English names, `erpnext_item_code`, local cache fields, active flag, soft delete, version.
- `item_department_mappings`: product relation, department relation, active flag, soft delete, version.
- `audit_logs`: action, actor id, entity type/id, payload, timestamp.

Indexes and constraints:
- Unique codes for branches, departments, products, and ERPNext item codes.
- Unique production center code per branch.
- Unique product/department mapping pair.
- Indexes on active mapping lookup fields.

## API Changes

Routes:
- `/admin/branches`
- `/admin/production-centers`
- `/admin/departments`
- `/admin/products`
- `/admin/item-department-mappings`
- `/fulfillment/splits/validate`

Error code:
- `MISSING_DEPARTMENT_MAPPING` when any requested product has no active item-department mapping.

## State Transitions

No workflow state machines are introduced.

## Authorization

Admin CRUD endpoints require `master-data:manage`.
Fulfillment split validation requires `fulfillment:split`.
Authorization is permission based through metadata and a guard. No direct role checks are used.

## Idempotency

No sensitive create/approve/split/batch/payment execution endpoint is introduced. CRUD creates use natural unique constraints and are not treated as idempotent workflow actions in this bootstrap.

## Audit Logs

Sensitive admin mutations create audit logs:
- `master_data.branch.created|updated|deleted`
- `master_data.production_center.created|updated|deleted`
- `master_data.department.created|updated|deleted`
- `master_data.product.created|updated|deleted`
- `master_data.item_department_mapping.created|updated|deleted`

## Tests

- Unit tests for missing mapping domain validation.
- Permission guard tests.
- Seed data tests.
- E2E tests for admin mapping and missing mapping response.

## Acceptance Criteria

- [x] Seed creates all required branches/departments.
- [x] Admin can map product to department.
- [x] Missing mapping returns `MISSING_DEPARTMENT_MAPPING`.

## Progress

- [x] Step 1: Read project rules and create ExecPlan.
- [x] Step 2: Add Prisma schema, seed data, and scripts.
- [x] Step 3: Add services, controllers, permissions, and tests.
- [x] Step 4: Run Prisma and backend verification commands.

## Surprises & Discoveries

- The repo started from a minimal bootstrap with no Prisma/auth modules yet.
- Docker Postgres and Redis are already running and healthy.
- Local port `5432` was already occupied by a host Postgres process, so Docker Postgres was moved to host port `55432`.
- Prisma 7 requires the new datasource config flow, so Prisma was pinned to 6.19.0 for the current NestJS bootstrap.

## Decision Log

- Use permission metadata and `x-permissions` guard for bootstrap protection until real auth is introduced.
- Keep fulfillment implementation to validation only; no split creation is added in this task.
- Keep products as operational cache rows with `erpnext_item_code`; no ERPNext API calls are introduced.

## Outcome

Completed and verified. Master data schema, seed data, permission-protected admin CRUD endpoints, audit logging for admin mutations, item department mapping CRUD, and fulfillment split mapping validation are implemented.

Verification run:
- `pnpm prisma:generate`
- `pnpm prisma:migrate:dev`
- `pnpm db:seed`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
