# Field Test Results - Day 1

Date: 2026-05-17  
Environment: staging, `https://api-staging.r8787m.cc`  
Recommendation: **Pause and fix**

## Readiness Result

Readiness checks passed:

- `/health/live`
- `/health/ready`
- admin login
- admin credential hygiene endpoint
- admin settings secret masking
- orders status report access
- ERPNext validate-connection

Staging containers were healthy:

- API image: `ghcr.io/r87823/awamir-plus-api:sha-db9d8db8e6d1`
- Worker image: `ghcr.io/r87823/awamir-plus-worker:sha-db9d8db8e6d1`
- PostgreSQL: healthy
- Redis: healthy

Pre-drill outbox status:

- `SUCCEEDED`: 7
- `DEAD_LETTER`: 1

Worker was running and logs showed `ERPNext sync worker started`.

## Backup And Rollback

Backup was taken before the drill:

- Backup file: `backups/awamir-plus-staging-r26-day1-20260517T080307Z.dump`
- SHA256: `7abc57f6a2c94a7d699e692eefd855886c6a7268875793429e69e7cb1e3eb3ba`

Rollback image tags:

```text
AWAMIR_API_IMAGE=ghcr.io/r87823/awamir-plus-api:sha-db9d8db8e6d1
AWAMIR_WORKER_IMAGE=ghcr.io/r87823/awamir-plus-worker:sha-db9d8db8e6d1
```

Application rollback command:

```bash
cd /opt/awamir-plus-staging
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml pull api worker
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml up -d --no-deps api worker
curl -fsS https://api-staging.r8787m.cc/health/ready
```

No restore was performed.

## Pilot Users And Scopes

Pilot users were created or verified with random temporary credentials, then password rotation was completed. No passwords or tokens were recorded.

| Username | Role | Branch Scope | Department Scope | Driver ID |
| --- | --- | --- | --- | --- |
| `field_branch_operator_day1` | `BRANCH_OPERATOR` | `RIYADH` | - | - |
| `field_branch_supervisor_day1` | `BRANCH_SUPERVISOR` | `RIYADH` | - | - |
| `field_fulfillment_coordinator_day1` | `FULFILLMENT_COORDINATOR` | - | - | - |
| `field_production_operator_day1` | `PRODUCTION_OPERATOR` | - | `BAKERY`, `HOT_KITCHEN` | - |
| `field_driver_day1` | `DRIVER` | - | - | `field-driver-day1` |
| `field_cashier_day1` | `CASHIER` | - | - | - |
| `field_accountant_day1` | `ACCOUNTANT` | - | - | - |
| `field_platform_admin_day1` | `PLATFORM_ADMIN` | - | - | - |

The original break-glass admin user was kept active.

## Master Data Readiness

Verified:

- Branch: `RIYADH`
- Production center: `RIYADH_MAIN_KITCHEN`
- Products:
  - `FATAYER_SPINACH` -> `ERP-FATAYER-SPINACH`
  - `SAMBOSA_CHEESE` -> `ERP-SAMBOSA-CHEESE`
- Departments:
  - `BAKERY`
  - `HOT_KITCHEN`

Readiness correction applied:

- `item_department_mappings` was empty at the start of the drill.
- Added:
  - `FATAYER_SPINACH` -> `BAKERY` -> `RIYADH_MAIN_KITCHEN`
  - `SAMBOSA_CHEESE` -> `HOT_KITCHEN` -> `RIYADH_MAIN_KITCHEN`

This was a non-destructive staging master-data correction required before fulfillment split could be tested.

## Controlled Smoke Order

Order:

- Order number: `ORD-RIYADH-20260517-00001`
- Order ID: `739b163c-38b7-4a98-93e9-226c27dd83fe`
- Grand total: `55`
- Items: `FATAYER_SPINACH`, `SAMBOSA_CHEESE`

Completed:

- Created draft order as branch operator.
- Submitted for approval.
- Approved as branch supervisor.
- Split into two work orders:
  - `e9e1114c-0e2a-43d6-974c-385c588b7dda`
  - `0ea84e7a-5eb0-48f3-a461-0fe230bad760`
- Production operator accepted, started, and marked both work orders ready.

Blocked:

- Delivery batching failed.
- Order after production:
  - `productionStatus=COMPLETED`
  - `deliveryStatus=READY`
  - `packingRequired=false`
  - workflow snapshot: `enablePackingStage=false`
- Delivery batch creation expects `deliveryStatus=WAITING_BATCH`.

This is a P1 workflow inconsistency between R8 packing-disabled behavior and R9 delivery batching eligibility.

## Payment And Cashbox

Because delivery batching was blocked, payment and accounting were continued as a controlled backend continuation to collect additional readiness evidence.

Payment:

- Payment ID: `f7a0c8e7-d567-48a9-92dc-1fd764fffc06`
- Method: `CASH`
- Amount: `55`
- Status after ERPNext enqueue: `PENDING_ERPNEXT_SYNC`

Cashbox:

- Cashbox ID: `d4f2ab47-443a-43ac-8c3e-16b63ae0ff37`
- Expected cash: `55`
- Collected cash: `55`
- Difference: `0`
- Cashbox submit/review/approve completed.

Audit evidence:

- Order audit rows: 8
- Payment audit rows: 3
- Cashbox audit rows: 5

## ERPNext Sync Result

Succeeded:

- Sales Order: `SAL-ORD-2026-00005`
- Sales Invoice: `ACC-SINV-2026-00003`

Pending / failed:

- Payment Entry was not created.
- Payment Entry outbox:
  - Operation: `CREATE_DRAFT_PAYMENT_ENTRY`
  - Status: `PENDING`
  - Retry count: 2
  - Last error: `duplicate_document`

Outbox rows for this drill:

| Operation | Status | Retry Count | ERPNext Reference | Last Error |
| --- | --- | ---: | --- | --- |
| `CREATE_SALES_ORDER` | `SUCCEEDED` | 0 | `SAL-ORD-2026-00005` | - |
| `CREATE_DRAFT_SALES_INVOICE` | `SUCCEEDED` | 0 | `ACC-SINV-2026-00003` | - |
| `CREATE_DRAFT_PAYMENT_ENTRY` | `PENDING` | 2 | - | `duplicate_document` |

The Payment Entry issue matches the known R19 follow-up and is not a worker wakeup failure.

## Daily Close And Reports

Accounting continuation:

- Reconcile payments endpoint returned:
  - Business date: `2026-05-17`
  - Total payments: `55`
  - Payments count: `1`
- Close financial day succeeded:
  - Financial day close ID: `9e914b44-cdc4-48e6-a61c-16803291d3d2`
  - Pending cashboxes: `0`

Report verification:

- Orders status report: passed with supervisor token during main drill.
- Payments summary: passed.
- Cashbox daily: passed.
- ERPNext failures: passed.
- Accounting close-day: passed.

One later report check with the accountant token failed for `orders/status` because `ACCOUNTANT` does not have `reports.view_operations`. This is expected permission separation, not a report outage.

## Security And Logs

Recent API/worker log scan found no matches for:

- bearer authorization header leakage
- access/refresh token leakage
- password/currentPassword/newPassword leakage
- password hash or refresh token hash leakage
- `AUTH_JWT_SECRET`
- ERPNext API key or API secret

No Flutter or ERPNext direct-client boundary changes were made.

## Incidents

### P1 - Delivery batching blocked after packing-disabled production completion

Module: delivery / fulfillment  
Affected order: `ORD-RIYADH-20260517-00001`  
Correlation ID: `req_2ebba13d-343b-4701-a362-18d9bd4454ab`

Observed:

- With `enablePackingStage=false`, the order reached `deliveryStatus=READY`.
- Delivery batching accepts only `deliveryStatus=WAITING_BATCH`.
- `POST /delivery/batches` returned `ORDER_NOT_READY_FOR_DELIVERY_BATCH`.

Required fix:

- Align R8/R9 delivery eligibility:
  - either delivery batching accepts `READY` as eligible, or
  - packing-disabled readiness transitions to `WAITING_BATCH`.
- Add e2e coverage for packing disabled -> production ready -> delivery batch.

### P2 - ERPNext Payment Entry duplicate document

Module: ERPNext sync  
Affected payment: `f7a0c8e7-d567-48a9-92dc-1fd764fffc06`

Observed:

- Sales Order and Sales Invoice synced successfully.
- Payment Entry outbox remained pending with `duplicate_document`.

Required fix:

- Implement the known R19 follow-up:
  - lookup/store existing ERPNext Payment Entry when duplicate is a safe idempotent match, or
  - make staging smoke payment identity unique enough to avoid ERPNext duplicate constraints.

### P2 - Staging master data mapping missing before drill

Module: master data / fulfillment  
Affected data: item-department mappings

Observed:

- Products and departments existed.
- `item_department_mappings` was empty.

Action taken:

- Added two non-destructive staging mappings for the pilot products.

Required fix:

- Add a pre-field-test master-data checklist item that explicitly verifies at least two active item-department mappings for the pilot branch/production center before order creation.

## Recommendation

**Pause and fix before Day 2.**

Do not expand controlled field testing until:

1. Delivery batching works for packing-disabled orders.
2. Payment Entry duplicate handling is resolved or the staging smoke payment identity is made unique.
3. Pilot item-department mappings are confirmed as part of pre-test readiness.

Day 2 can proceed only after the delivery batching fix is deployed and verified with the same order flow.
