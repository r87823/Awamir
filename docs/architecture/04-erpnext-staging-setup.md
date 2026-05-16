# ERPNext Staging Setup

Awamir Plus connects to ERPNext only from the backend.

Flutter must never use an ERPNext URL, API key, API secret, token, SDK, or direct document endpoint.

## Required Backend Env

Set these in staging/production:

```text
NODE_ENV=staging
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ERPNEXT_BASE_URL=https://erpnext-staging.example.com
ERPNEXT_API_KEY=...
ERPNEXT_API_SECRET=...
ERPNEXT_COMPANY=Awamir Plus
ERPNEXT_HEALTH_ENABLED=true
ERPNEXT_WORKER_ENABLED=true
```

Optional but required for real document sync paths:

```text
ERPNEXT_TIMEOUT_MS=5000
ERPNEXT_DEFAULT_CUSTOMER=...
ERPNEXT_DEFAULT_WAREHOUSE=...
ERPNEXT_INCOME_ACCOUNT=...
ERPNEXT_RECEIVABLE_ACCOUNT=...
ERPNEXT_CASH_ACCOUNT=...
ERPNEXT_CARD_ACCOUNT=...
ERPNEXT_TRANSFER_ACCOUNT=...
ERPNEXT_ONLINE_ACCOUNT=...
ERPNEXT_CREDIT_ACCOUNT=...
```

`ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, and `ERPNEXT_COMPANY` are validated when `NODE_ENV=staging` or `NODE_ENV=production`.

## Required ERPNext Data

ERPNext staging should contain:

- Company matching `ERPNEXT_COMPANY`.
- Customer records matching Awamir `order.customerId`, or `ERPNEXT_DEFAULT_CUSTOMER` for staging fallback.
- Item records matching Awamir `order_items.erpnext_item_code`.
- Warehouse matching `ERPNEXT_DEFAULT_WAREHOUSE`.
- Income account for Sales Invoice rows.
- Receivable account and payment destination accounts for Payment Entry.

Awamir products are an operational cache of ERPNext Items. Missing item codes fail sync with `missing_item_code`; they do not rollback Awamir orders.

## Sync Ownership

Accounting controls review and enqueue decisions. `ERPNextSyncService` owns ERPNext payload mapping and reference updates. `ERPNextClient` owns HTTP.

Payments and Cashboxes remain ERPNext-isolated. They may create operational records and cashbox entries, but they do not import ERPNext modules or clients.

## Health

`GET /health` and `GET /health/ready` include an ERPNext check only when:

```text
ERPNEXT_HEALTH_ENABLED=true
```

The health check redacts secrets and reports status, HTTP status, latency, and safe error code.

## R19-T02 Real Staging Verification

Run the real staging smoke command only against a configured staging backend and staging ERPNext site. The command never prints ERPNext secrets or Awamir JWTs.

Required command environment:

```text
DATABASE_URL=postgresql://...
AWAMIR_API_BASE_URL=https://api-staging.example.com
AWAMIR_VERIFY_USERNAME=admin
AWAMIR_VERIFY_PASSWORD=demo
AWAMIR_VERIFY_BRANCH_CODE=RIYADH
AWAMIR_VERIFY_PRODUCT_CODE=FATAYER_SPINACH
AWAMIR_VERIFY_PAYMENT_METHOD=CASH
AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP=true
```

`DATABASE_URL` is used only for verification inspection of Awamir outbox rows, sync logs, and stored ERPNext references. ERPNext credentials still come from backend env/config only.

Start the backend and worker:

```bash
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml up -d api worker postgres redis
```

Validate connectivity:

```bash
curl -fsS https://api-staging.example.com/health/ready
curl -fsS -X POST -H "authorization: Bearer <AWAMIR_TOKEN>" https://api-staging.example.com/erpnext/validate-connection
```

Run the full smoke:

```bash
pnpm erpnext:verify-staging
```

Inside the deployed API container, the same command can be run with the container's server-only env:

```bash
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml exec api pnpm --filter @awamir/api erpnext:verify-staging
```

The smoke performs:

1. Login to Awamir backend.
2. Validate ERPNext connection through `POST /erpnext/validate-connection`.
3. Create a draft Awamir order through `POST /orders`.
4. Submit and approve the order through the order API.
5. Review and enqueue Sales Order sync through Accounting.
6. Wait for the worker to create a real ERPNext `Sales Order`.
7. Prepare the staging test order for invoice eligibility when `AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP=true`.
8. Review and enqueue draft Sales Invoice sync through Accounting.
9. Wait for the worker to create a real ERPNext draft `Sales Invoice`.
10. Collect and review a payment through the backend.
11. Enqueue Payment Entry sync through Accounting.
12. Wait for the worker to create a real ERPNext draft `Payment Entry`.
13. Print ERPNext document names and Awamir outbox/log status.

Verify in ERPNext UI:

- Open **Selling > Sales Order** and search for the printed Sales Order name.
- Open **Accounts > Sales Invoice** and search for the printed Sales Invoice name.
- Open **Accounts > Payment Entry** and search for the printed Payment Entry name.
- Confirm the Awamir order number appears in the custom Awamir fields when those fields exist on the staging site.

Rollback/cleanup notes for staging test documents:

- Cancel/delete the printed draft Sales Invoice and Payment Entry if ERPNext allows deletion in staging.
- Cancel/delete the printed Sales Order after dependent draft documents are removed.
- Keep the Awamir order/payment rows as audit evidence unless the staging database is being refreshed.
- Never clean up by deleting outbox/sync-log rows before investigating failures; those rows are the verification trail.

## Retry And Dead Letter

ERPNext sync uses `integration_outbox` plus `erpnext_sync_logs`.

- Network and timeout failures create failed sync logs.
- Operational records are not rolled back.
- Retry scheduling follows the shared backoff policy.
- After the configured retry sequence, rows move to `DEAD_LETTER` for manual review.
