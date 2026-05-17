# Field Test Results - Day 1 Rerun

Date: 2026-05-17  
Environment: staging, `https://api-staging.r8787m.cc`  
Recommendation: **Proceed Day 2**

## Readiness Result

Public readiness checks passed:

- `/health/live`
- `/health/ready`

Authenticated readiness checks that require a short-lived operator token were not run through the helper script because pilot passwords are intentionally not recorded. The rerun operational flow was executed from inside the staging API container through the existing Nest services, state machines, outbox, worker, and ERPNext client boundary. No Flutter, ERPNext mapping, schema, or old Day 1 record was changed.

Staging containers were healthy:

- API image: `ghcr.io/r87823/awamir-plus-api:sha-d40e49d30ae3`
- Worker image: `ghcr.io/r87823/awamir-plus-worker:sha-d40e49d30ae3`
- PostgreSQL: healthy
- Redis: healthy

Pre-drill outbox status:

- `SUCCEEDED`: 11
- `DEAD_LETTER`: 2

Post-drill readiness:

- `/health/live`: passed
- `/health/ready`: passed
- Pending outbox: `0`
- Failed outbox: `0`
- Dead-letter outbox: `2`
- ERPNext health: `ok`

The two dead-letter rows are preserved audit evidence from earlier staging drills and were not patched or retried.

## Backup And Rollback

Backup was taken before the rerun:

- Backup file: `backups/awamir-plus-staging-r26-rerun-day1-20260517T091321Z.dump`
- SHA256: `b9f05e79a55abe271d9b94a3787f1e8ea572d9362f341dc0c760d3f171dde395`

Rollback image tags at rerun start:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-d40e49d30ae3
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-d40e49d30ae3
```

Application rollback command:

```bash
cd /opt/awamir-plus-staging
# Restore the previous AWAMIR_API_IMAGE and AWAMIR_WORKER_IMAGE in .env.staging if needed.
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml pull api worker
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml up -d --no-deps api worker
curl -fsS https://api-staging.r8787m.cc/health/ready
```

No restore was performed.

## Pilot Users And Master Data

Existing Day 1 pilot users were present, active, and no longer flagged for password change:

| Username | Status |
| --- | --- |
| `field_accountant_day1` | active |
| `field_branch_operator_day1` | active |
| `field_branch_supervisor_day1` | active |
| `field_cashier_day1` | active |
| `field_fulfillment_coordinator_day1` | active |
| `field_platform_admin_day1` | active |
| `field_production_operator_day1` | active |

Verified pilot master data:

- Branch: `RIYADH`
- Products:
  - `FATAYER_SPINACH` -> `ERP-FATAYER-SPINACH`
  - `SAMBOSA_CHEESE` -> `ERP-SAMBOSA-CHEESE`
- Departments:
  - `BAKERY`
  - `HOT_KITCHEN`
- Active item-department mappings:
  - `FATAYER_SPINACH` -> `BAKERY` -> `RIYADH_MAIN_KITCHEN`
  - `SAMBOSA_CHEESE` -> `HOT_KITCHEN` -> `RIYADH_MAIN_KITCHEN`

The rerun used a unique driver/collector identity `field-driver-rerun-131B9C78` / `field-driver-rerun-actor-131B9C78` to avoid modifying already-approved Day 1 cashboxes for the same Riyadh business date.

## Controlled Smoke Order

Order:

- Order number: `ORD-RIYADH-20260517-00003`
- Order ID: `fdb5f02d-55d1-49c4-91cc-7b54715f6a90`
- Grand total: `55`
- Items: `FATAYER_SPINACH`, `SAMBOSA_CHEESE`

Completed:

- Created draft order.
- Submitted for approval.
- Approved.
- Split into two work orders:
  - `087698f2-dc4e-4b75-a457-2596d4778835`
  - `94da54b1-eb0f-4e2a-ac07-e61cde0fd2cd`
- Production accepted, moved in production, and marked both work orders ready.

R26-FIX-01 verification:

- After production:
  - `productionStatus=COMPLETED`
  - `deliveryStatus=WAITING_BATCH`
  - `/delivery/ready-orders` included the fresh order.
- Delivery batch creation succeeded.

Delivery:

- Delivery batch ID: `f1a7ed33-11be-4d28-8744-d5d55eeaf35c`
- Delivery batch number: `DB-20260517-00002`
- Assigned driver: `field-driver-rerun-131B9C78`
- Batch status after driver assignment: `DRIVER_ASSIGNED`
- Batch status after delivery flow: `DELIVERED`
- Final order delivery status: `DELIVERED`

## Payment And Cashbox

Payment:

- Payment ID: `c34308a9-1dd4-4632-a6b1-b2b02365c586`
- Method: `CASH`
- Amount: `55`
- Final payment status: `POSTED`
- ERPNext Payment Entry: `ACC-PAY-2026-00005`

Cashbox:

- Cashbox ID: `05f3efae-e596-490f-8f1d-53c1ae64799d`
- Collector: `field-driver-rerun-actor-131B9C78`
- Status: `APPROVED`
- Expected cash: `55`
- Collected cash: `55`
- Difference: `0`
- Cashbox entry: `554cc154-7f19-4e5d-ba5b-734349ab57dd`
- Cashbox entry status: `REVIEWED`

## ERPNext Sync Result

ERPNext references stored in Awamir:

- Sales Order: `SAL-ORD-2026-00006`
- Sales Invoice: `ACC-SINV-2026-00004`
- Payment Entry: `ACC-PAY-2026-00005`

Outbox rows for the rerun:

| Operation | Status | Retry Count | ERPNext Reference | Last Error |
| --- | --- | ---: | --- | --- |
| `CREATE_SALES_ORDER` | `SUCCEEDED` | 0 | `SAL-ORD-2026-00006` | - |
| `CREATE_DRAFT_SALES_INVOICE` | `SUCCEEDED` | 0 | `ACC-SINV-2026-00004` | - |
| `CREATE_DRAFT_PAYMENT_ENTRY` | `SUCCEEDED` | 0 | `ACC-PAY-2026-00005` | - |

Sync log rows:

| Operation | Status | Correlation ID |
| --- | --- | --- |
| `CREATE_SALES_ORDER` | `SUCCEEDED` | `c551a798-7829-4bf6-9bdd-5b992a67f0a6` |
| `CREATE_DRAFT_SALES_INVOICE` | `SUCCEEDED` | `f4aeeaf8-8b8e-4763-a743-780709120eff` |
| `CREATE_DRAFT_PAYMENT_ENTRY` | `SUCCEEDED` | `e4a03e74-18d8-4306-8842-495df24b35b3` |

R26-FIX-02 verification passed: Payment Entry synced successfully and did not fail on the earlier draft-invoice handling issue.

Final order accounting state:

- `accountingStatus=ACCOUNTING_POSTED`

## Daily Close And Reports

Accounting reconciliation for `2026-05-17`:

- Total payments: `146`
- Payments count: `4`
- Total cash entries: `110`
- Cash entries count: `2`
- Approved cashboxes: `2`
- Balanced: `true`

Financial day close behavior:

- Existing close record returned: `9e914b44-cdc4-48e6-a61c-16803291d3d2`
- Business date: `2026-05-17`
- Existing close totals: cash `55`, payments `55`
- Existing close created at: `2026-05-17T08:12:29.041Z`

Because Day 1 was already closed before this rerun, the close record was returned idempotently and totals were not recalculated. Fresh rerun totals were verified through reconciliation and reports.

Report verification:

- Orders status report: passed.
- Payments summary: passed.
- Cashbox daily report for rerun collector: passed.
- ERPNext failures report: passed and still shows the preserved historical failure.
- Accounting close-day report: passed and shows existing close record.

Report notes:

- Orders report includes prior same-day staging records.
- Payments summary includes prior same-day staging payments.
- Cashbox daily report filtered to the rerun collector shows expected cash `55`, collected cash `55`, difference `0`.
- ERPNext failures total remains `1` in the report window because the old Day 1 failure is preserved.

## Audit And Logs

Audit evidence:

- Audit rows tied to rerun order, work orders, delivery batch, payment, and cashbox: `27`

Recent API/worker log scan found no matches for:

- bearer authorization header leakage
- access/refresh token leakage
- current/new password leakage
- password hash or refresh token hash leakage
- `AUTH_JWT_SECRET`
- ERPNext API secret markers

No Flutter or ERPNext direct-client boundary changes were made.

## Incidents

No P0/P1/P2 incidents were found during the rerun.

Historical notes preserved:

- Existing `DEAD_LETTER` outbox rows remain from earlier staging drills.
- The original Day 1 failed payment/outbox was not patched, revived, or deleted.
- Same-day financial close totals remain from the original close, by idempotent close-day design.

## Recommendation

**Proceed Day 2** with the controlled pilot scope.

Recommended Day 2 guardrails:

- Start with a small batch of 10-20 orders.
- Continue checking `/health/ready`, worker status, and ERPNext outbox after each operational batch.
- Review payment/cashbox totals before and after close-day.
- Do not manually clear historical dead letters; track them separately from Day 2 operational records.
