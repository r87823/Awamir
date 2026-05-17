# Field Test Results - Day 2

Date: 2026-05-17  
Environment: staging, `https://api-staging.r8787m.cc`  
Recommendation: **Proceed broader pilot**

## Readiness Result

Public readiness checks passed:

- `/health/live`
- `/health/ready`

Authenticated readiness checks that require a short-lived operator token were not run through the helper script because pilot passwords are intentionally not recorded. The Day 2 operational flow was executed from inside the staging API container through the existing Nest services, state machines, outbox, worker, and ERPNext client boundary.

No code, Flutter, schema, ERPNext mapping, or historical Day 1 record was changed.

Staging containers were healthy:

- API image: `ghcr.io/r87823/awamir-plus-api:sha-d40e49d30ae3`
- Worker image: `ghcr.io/r87823/awamir-plus-worker:sha-d40e49d30ae3`
- PostgreSQL: healthy
- Redis: healthy

Pre-drill outbox status:

- `SUCCEEDED`: 14
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

Backup was taken before the Day 2 drill:

- Backup file: `backups/awamir-plus-staging-r26-day2-20260517T122609Z.dump`
- SHA256: `2b60cbfc25e06d36caae55fa8f5c15d93cc23cf33765937de0004f4b07506703`

Rollback image tags at Day 2 start:

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

Existing pilot users were present, active, and no longer flagged for password change:

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

The Day 2 drill used a unique driver/collector identity `field-driver-day2-BFF4D085` / `field-driver-day2-actor-BFF4D085` to avoid modifying already-approved Day 1 cashboxes on the same Riyadh business date.

## Controlled Smoke Order

Order:

- Order number: `ORD-RIYADH-20260517-00004`
- Order ID: `286fa4bd-4739-4934-b21b-ba54cd67b4ba`
- Grand total: `57`
- Items: `FATAYER_SPINACH`, `SAMBOSA_CHEESE`

Completed:

- Created draft order.
- Submitted for approval.
- Approved.
- Split into two work orders:
  - `7bd19ade-ebba-4647-907a-f39898448274`
  - `ec405fd6-0423-4340-b415-a4b21b580bba`
- Production accepted, moved in production, and marked both work orders ready.

Delivery readiness verification:

- After production:
  - `productionStatus=COMPLETED`
  - `deliveryStatus=WAITING_BATCH`
  - `/delivery/ready-orders` included the Day 2 order.
- Delivery batch creation succeeded.

Delivery:

- Delivery batch ID: `e94cba6a-f6e1-41e6-b3fe-3c6a293e5164`
- Delivery batch number: `DB-20260517-00003`
- Assigned driver: `field-driver-day2-BFF4D085`
- Batch status after driver assignment: `DRIVER_ASSIGNED`
- Batch status after delivery flow: `DELIVERED`
- Final order delivery status: `DELIVERED`

## Payment And Cashbox

Payment:

- Payment ID: `711c5c56-0f62-49a0-a303-f77bdaf5e449`
- Method: `CASH`
- Amount: `57`
- Final payment status: `POSTED`
- ERPNext Payment Entry: `ACC-PAY-2026-00006`

Cashbox:

- Cashbox ID: `e4b5afb9-1d5f-4307-b742-a23f6ca771e0`
- Collector: `field-driver-day2-actor-BFF4D085`
- Status: `APPROVED`
- Expected cash: `57`
- Collected cash: `57`
- Difference: `0`
- Cashbox entry: `53ada857-2615-4770-971a-1b25b9a4e07b`
- Cashbox entry status: `REVIEWED`

## ERPNext Sync Result

ERPNext references stored in Awamir:

- Sales Order: `SAL-ORD-2026-00007`
- Sales Invoice: `ACC-SINV-2026-00005`
- Payment Entry: `ACC-PAY-2026-00006`

Outbox rows for Day 2:

| Operation | Status | Retry Count | ERPNext Reference | Last Error |
| --- | --- | ---: | --- | --- |
| `CREATE_SALES_ORDER` | `SUCCEEDED` | 0 | `SAL-ORD-2026-00007` | - |
| `CREATE_DRAFT_SALES_INVOICE` | `SUCCEEDED` | 0 | `ACC-SINV-2026-00005` | - |
| `CREATE_DRAFT_PAYMENT_ENTRY` | `SUCCEEDED` | 0 | `ACC-PAY-2026-00006` | - |

Sync log rows:

| Operation | Status | Correlation ID |
| --- | --- | --- |
| `CREATE_SALES_ORDER` | `SUCCEEDED` | `d4cf8f1b-97ae-490d-8b7e-17c1f56705ec` |
| `CREATE_DRAFT_SALES_INVOICE` | `SUCCEEDED` | `51e845fc-d245-4bfa-b2dc-122068973494` |
| `CREATE_DRAFT_PAYMENT_ENTRY` | `SUCCEEDED` | `93a210bc-4c44-40a2-9cc5-ecf3f3bdfadd` |

Final order accounting state:

- `accountingStatus=ACCOUNTING_POSTED`

Final payment state:

- `status=POSTED`

## Daily Close And Reports

Accounting reconciliation for `2026-05-17`:

- Total payments: `203`
- Payments count: `5`
- Total cash entries: `167`
- Cash entries count: `3`
- Approved cashboxes: `3`
- Balanced: `true`

Financial day close behavior:

- Existing close record returned: `9e914b44-cdc4-48e6-a61c-16803291d3d2`
- Business date: `2026-05-17`
- Existing close totals: cash `55`, payments `55`
- Existing close created at: `2026-05-17T08:12:29.041Z`

Because the same Riyadh business date was already closed before Day 2, the close record was returned idempotently and totals were not recalculated. Fresh Day 2 totals were verified through reconciliation and reports.

Report verification:

- Orders status report: passed.
- Payments summary: passed.
- Cashbox daily report for Day 2 collector: passed.
- ERPNext failures report: passed and still shows the preserved historical failure.
- Accounting close-day report: passed and shows the existing close record.

Report notes:

- Orders report includes prior same-day staging records.
- Payments summary includes prior same-day staging payments.
- Cashbox daily report filtered to the Day 2 collector shows expected cash `57`, collected cash `57`, difference `0`.
- ERPNext failures total remains `1` in the report window because the old Day 1 failure is preserved.

## Audit And Logs

Audit evidence:

- Audit rows tied to Day 2 order, work orders, delivery batch, payment, and cashbox: `27`

Recent API/worker log scan found no matches for:

- bearer authorization header leakage
- access/refresh token leakage
- current/new password leakage
- password hash or refresh token hash leakage
- `AUTH_JWT_SECRET`
- ERPNext API secret markers

No Flutter or ERPNext direct-client boundary changes were made.

## Incidents

No P0/P1/P2 incidents were found during Day 2.

Historical notes preserved:

- Existing `DEAD_LETTER` outbox rows remain from earlier staging drills.
- Day 1 records and failed historical outbox rows were not patched, revived, or deleted.
- Same-day financial close totals remain from the original close, by idempotent close-day design.

## Recommendation

**Proceed broader pilot** with controlled production preparation rather than new feature development.

Recommended next guardrails:

- Expand slowly from the current single-branch scope.
- Keep per-day order volume limited until operators complete at least one clean real operating day outside scripted drill conditions.
- Continue checking `/health/ready`, worker status, outbox status, ERPNext failures, and payment/cashbox reconciliation after each operational batch.
- Schedule a true next-business-day close drill so close-day totals are captured on a fresh date rather than the already-closed `2026-05-17`.
- Keep historical dead letters as audit evidence and track them separately from broader pilot records.
