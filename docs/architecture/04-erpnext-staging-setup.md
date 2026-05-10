# ERPNext Staging Setup

Awamir Plus connects to ERPNext only from the backend.

Flutter must never use an ERPNext URL, API key, API secret, token, SDK, or direct document endpoint.

## Required Backend Env

Set these in staging/production:

```text
ERPNEXT_BASE_URL=https://erpnext-staging.example.com
ERPNEXT_API_KEY=...
ERPNEXT_API_SECRET=...
ERPNEXT_COMPANY=Awamir Plus
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

## Retry And Dead Letter

ERPNext sync uses `integration_outbox` plus `erpnext_sync_logs`.

- Network and timeout failures create failed sync logs.
- Operational records are not rolled back.
- Retry scheduling follows the shared backoff policy.
- After the configured retry sequence, rows move to `DEAD_LETTER` for manual review.
