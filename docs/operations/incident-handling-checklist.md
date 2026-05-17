# Incident Handling Checklist

Use this checklist during controlled field testing. Prefer pause-and-investigate over ad hoc data edits.

## First Response

1. Record incident time, user, branch, affected order/payment/cashbox/outbox IDs, and correlation ID if available.
2. Pause the affected workflow if financial or fulfillment accuracy is at risk.
3. Check `/health/live` and `/health/ready`.
4. Check API and worker logs for the correlation ID.
5. Do not delete outbox, sync logs, payments, cashbox entries, or orders during triage.

## ERPNext Sync Failure

- Check admin ERPNext outbox and sync logs.
- Identify operation, source type, source ID, retry count, next retry time, and last error.
- If status is retryable, use the existing retry endpoint.
- If status is `DEAD_LETTER`, review payload mapping, ERPNext item/customer/account/warehouse data, and duplicate-document context.
- Confirm Awamir operational workflow remains valid even when ERPNext sync failed.
- Escalate to ERPNext owner if ERPNext master data is missing or wrong.

## Worker Outage

- Confirm worker container health.
- Confirm Redis health.
- Check whether outbox rows are due and pending.
- Restart only the worker if API is healthy and no deployment is in progress:

```bash
cd /opt/awamir-plus-staging
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml up -d --no-deps worker
```

- Verify outbox processing resumes.

## Payment Or Cashbox Discrepancy

- Stop additional cashbox submission for the affected collector.
- Compare payment rows, cashbox entries, expected cash, collected cash, and difference.
- Confirm payment idempotency key and collector identity.
- Return the cashbox with a reason if correction is operationally required.
- Do not manually alter totals; expected cash is calculated from entries.

## Delivery Issue

- Confirm batch status, batch order status, driver assignment, and order delivery status.
- Use existing delivery actions only; do not directly edit statuses.
- Returned orders require standardized reason.
- If physical delivery state differs from Awamir state, pause batching for the branch until reconciled.

## Auth Abuse Or Credential Compromise

- Check rate-limit keys and login failure audit records.
- Disable compromised user through Admin.
- Revoke active sessions for the user.
- Force password rotation when appropriate.
- Rotate any shared/demo credentials immediately.
- Review logs for token/password leakage; do not paste secrets into tickets.

## Database Or Redis Health

- If database readiness fails, stop field testing and avoid writes until health is restored.
- If Redis is down, auth rate limiting may degrade and worker queues may stall.
- Do not restart persistent services without release engineer approval unless a runbook explicitly allows it.

## Backup And Restore Escalation

- Take a fresh backup before any reviewed recovery action that might affect data.
- Database restore requires explicit approval from the stop-test approver.
- Prefer application rollback before database rollback when schema is unchanged.

## Closeout

- Record cause, impact, recovery action, affected records, and whether field testing resumed.
- Add follow-up task for any missing tool, report, or guardrail.
- Keep audit logs and sync logs as the investigation trail.
