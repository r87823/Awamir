# R19-T02 Real ERPNext Staging Verification

## Purpose / Big Picture

Verify the existing R19 ERPNext integration against a real ERPNext staging instance without changing Flutter, leaking secrets, or bypassing the backend ERPNext sync boundary. The result is a repeatable staging-only smoke command that validates connectivity, enqueues real Sales Order, Sales Invoice, and Payment Entry syncs through the Accounting/ERPNextSyncService path, and reports Awamir references plus outbox/sync-log status.

## Scope

Included:
- Safe `.env.staging.example` updates for required ERPNext staging variables.
- A backend verification script/command that uses the Awamir API for auth, order creation, accounting review/enqueue, and payment collection.
- Prisma read-only inspection for outbox, sync logs, and stored ERPNext references.
- Staging smoke documentation with required env, runbook, ERPNext UI checks, and cleanup notes.
- Boundary scans for Flutter and Payments/Cashboxes.

Excluded:
- Flutter changes.
- Real secrets in committed files.
- New ERPNext HTTP call sites outside `ERPNextClient`.
- New business modules.
- Changes to retry/dead-letter behavior.

## Files Expected To Change

- `.env.staging.example`
- `package.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/scripts/verify-erpnext-staging.ts`
- `docs/architecture/04-erpnext-staging-setup.md`
- `docs/plans/R19-T02-real-erpnext-staging-verification.md`

## Data Model Changes

None.

## API Changes

None.

The verification script uses existing endpoints:
- `POST /auth/login`
- `POST /erpnext/validate-connection`
- `POST /orders`
- `POST /orders/:id/submit-for-approval`
- `POST /orders/:id/approve`
- `POST /accounting/orders/:orderId/review-sales-order`
- `POST /accounting/orders/:orderId/sync-sales-order`
- `POST /accounting/orders/:orderId/review-invoice`
- `POST /accounting/orders/:orderId/sync-invoice`
- `POST /payments/branch`
- `POST /accounting/payments/:paymentId/review`
- `POST /accounting/payments/:paymentId/sync`

## State Transitions

Operational state transitions remain unchanged:
- Draft order -> submitted -> approved through existing order endpoints.
- Accounting review/enqueue through existing accounting endpoints.

The script may prepare the staging test order for invoice eligibility by setting `deliveryStatus=WAITING_BATCH` only when `AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP=true`. This is a staging verification shortcut for invoice sync prerequisites; ERPNext sync itself still goes through Accounting/ERPNextSyncService.

## Authorization

The script authenticates with a configured staging Awamir user and relies on backend permission checks. No role checks are added.

## Idempotency

The script creates unique test orders and stable idempotency keys per run:
- `r19-t02-payment:{runId}`

ERPNext sync outbox idempotency remains owned by existing service keys.

## Audit Logs

Existing backend audit paths are exercised:
- order creation/submission/approval
- accounting review/enqueue
- payment collection/review/enqueue
- ERPNext sync success/failure events

## Tests

No new Jest tests are required for the staging smoke script. Existing mock ERPNext tests remain the automated regression layer.

Verification commands:
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`

Optional real staging command:
- `pnpm erpnext:verify-staging`

## Acceptance Criteria

- [x] Real ERPNext validate-connection succeeds when staging env is configured.
- [ ] Real Sales Order can be created in ERPNext staging.
- [ ] Real Draft Sales Invoice can be created in ERPNext staging.
- [ ] Real Payment Entry can be created in ERPNext staging.
- [ ] ERPNext document references are stored in Awamir.
- [x] Sync logs show success/failure clearly.
- [x] Failure does not rollback Awamir operation.
- [x] Retry/dead-letter behavior remains unchanged.
- [x] No secrets are committed or logged.
- [x] No ERPNext references exist in Flutter.
- [x] Payments/Cashboxes remain ERPNext-import-free.

## Progress

- [x] Step 1: Read project rules, R19 docs, ERPNext sync code, health, and boundaries.
- [x] Step 2: Add safe env example and verification command/script.
- [x] Step 3: Update staging smoke documentation.
- [x] Step 4: Run scans and verification commands.
- [x] Step 5: Run real staging verification if local/server env is available.

## Surprises & Discoveries

- Initial boundary scan found no ERPNext references in Flutter and no ERPNext imports in Payments/Cashboxes. Payments still contains non-secret `erpnextDoctype`/idempotency strings for outbox payload metadata only.
- Local e2e tests require PostgreSQL at `localhost:55432`; this environment did not have that database available.
- The full verification command requires `AWAMIR_API_BASE_URL` plus database access to the matching Awamir staging database. Those values were not present in the local shell, so the command failed fast without faking success.
- Public staging health and `POST /erpnext/validate-connection` succeeded against `https://api-staging.r8787m.cc`; ERPNext health returned HTTP 200 with `message=pong`.

## Decision Log

- Use the Awamir backend API for all user-visible workflow actions so permissions and standardized API behavior are exercised.
- Use Prisma only to inspect verification artifacts and to optionally prepare invoice eligibility for staging-only smoke runs.
- Do not print tokens, ERPNext keys, API secrets, database URLs, or Authorization headers.

## Outcome

Implementation added:
- Safe staging env template additions.
- `pnpm erpnext:verify-staging` command.
- `apps/api/scripts/verify-erpnext-staging.ts` smoke verifier.
- ERPNext staging setup documentation with full smoke and cleanup instructions.

Verification completed:
- `pnpm format` passed.
- `pnpm prisma:generate` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- Boundary scans passed: no ERPNext references in `apps/mobile`, and no ERPNext imports in `apps/api/src/payments` or `apps/api/src/cashboxes`.
- `GET https://api-staging.r8787m.cc/health/ready` passed with DB, Redis, outbox, and ERPNext health `ok`.
- `POST https://api-staging.r8787m.cc/erpnext/validate-connection` passed with `valid=true`.

Blocked/skipped:
- `pnpm test:e2e` could not run because the local e2e database at `localhost:55432` was unavailable.
- `pnpm erpnext:verify-staging` failed fast with missing `AWAMIR_API_BASE_URL`; full Sales Order, Sales Invoice, and Payment Entry creation was not executed from this local shell.

Final R19-T02 status: implementation and repeatable verification tooling are ready; real ERPNext connectivity is verified, but the full document sync smoke is pending execution inside a fully configured staging API/container environment.
