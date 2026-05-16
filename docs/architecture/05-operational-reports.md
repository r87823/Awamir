# Operational Reports

R22 adds read-only operational reporting endpoints backed only by the Awamir database.

Reports never call ERPNext directly and never change operational workflow state.

## Endpoints

- `GET /reports/orders/status`
- `GET /reports/production/delays`
- `GET /reports/delivery/returns`
- `GET /reports/payments/summary`
- `GET /reports/cashboxes/daily`
- `GET /reports/erpnext/failures`
- `GET /reports/accounting/close-day`

## Permissions

- `reports.view_operations`: orders, production, and delivery reports.
- `reports.view_financials`: payment, cashbox, and accounting close-day reports.
- `reports.view_erpnext`: ERPNext sync failure report.

Existing permission guards remain the enforcement point. Reports do not use direct role checks.

## Date Range

All report endpoints accept:

- `dateFrom`
- `dateTo`

If omitted, the backend uses the last 7 days. R22 enforces a 90-day maximum range for every report to keep queries predictable.

Invalid or too-large ranges return standardized API errors with:

```text
INVALID_REPORT_DATE_RANGE
```

## Branch Scope

Branch-scoped users can only see data inside their branch scope where the report has a branch dimension. Report branch filters are intersected with the actor's branch scope.

Unscoped users with the required report permission can query all branches.

## Examples

```bash
curl -H "authorization: Bearer <token>" \
  "https://api-staging.r8787m.cc/reports/orders/status?dateFrom=2026-05-01&dateTo=2026-05-16&branchId=<branch-id>"
```

```bash
curl -H "authorization: Bearer <token>" \
  "https://api-staging.r8787m.cc/reports/erpnext/failures?status=DEAD_LETTER"
```
