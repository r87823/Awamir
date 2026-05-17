# Broader Pilot Readiness

Date: 2026-05-17  
Environment: staging / controlled production preparation  
Decision: **Proceed broader pilot**

## Readiness Summary

R26 controlled field testing completed successfully:

- Day 1 rerun passed with fresh order/payment/cashbox records.
- Day 2 passed with fresh order/payment/cashbox records.
- No P0/P1/P2 incidents were found.
- Delivery readiness after production reached `WAITING_BATCH` and delivery batching succeeded.
- ERPNext Sales Order, Sales Invoice, and Payment Entry sync succeeded.
- Cashbox expected cash, collected cash, and difference balanced.
- Payment status reached `POSTED`.
- Order accounting status reached `ACCOUNTING_POSTED`.
- Operational reports passed.
- Recent API/worker log scans found no token, password, JWT secret, or ERPNext secret leakage.

Field-test evidence:

- Day 1 rerun: `docs/operations/field-test-results-day-1-rerun.md`
- Day 2: `docs/operations/field-test-results-day-2.md`

Known preserved staging evidence:

- Historical `DEAD_LETTER` rows remain from earlier drills.
- They must not be deleted or patched automatically.
- Any remediation requires a separate approved task with affected IDs, root cause, and rollback notes.

## Recommended Broader Pilot Scope

Keep the next pilot deliberately narrow:

| Area | Recommendation |
| --- | --- |
| Branches | Start with 1 branch; expand to 2 branches only after two clean broader-pilot operating days. |
| Production centers | 1 production center. |
| Departments | 2 departments: bakery and hot kitchen pilot departments. |
| Branch operators | 2-4 named users, no shared accounts. |
| Branch supervisors | 1-2 named users. |
| Fulfillment coordinators | 1 primary, 1 backup if available. |
| Production operators | 2 named users, scoped only to assigned departments. |
| Drivers | 1-2 named driver identities. |
| Cashiers | 1 primary cashier, 1 backup if available. |
| Accountants | 1 accountant responsible for ERPNext sync review and close-day checks. |
| Platform admins | 1 release engineer plus 1 break-glass admin. |
| Order volume | 20-40 real orders/day maximum for the first two broader-pilot days. |
| Operating hours | Defined business hours only; no unsupervised after-hours pilot operation. |

Expansion rule:

- Expand only after two clean broader-pilot operating days.
- “Clean” means no P0/P1/P2 incidents, no unreconciled payments/cashboxes, no stuck ERPNext outbox rows, no permission/scope breach, and no secret leakage.

## Support Ownership

Before the broader pilot starts, assign named owners:

| Area | Owner Required |
| --- | --- |
| Operations lead | Owns daily go/no-go and stop-test decisions. |
| Branch lead | Confirms operators and supervisors are ready. |
| Production lead | Confirms department queues and production operators. |
| Delivery lead | Confirms driver identity and delivery procedure. |
| Cashier lead | Owns cashbox submit/review/approve discipline. |
| Accounting lead | Owns ERPNext sync, reconciliation, and financial close. |
| ERPNext owner | Owns ERPNext master data, accounts, warehouse, and credential changes. |
| Release engineer | Owns deployment rollback, health checks, backups, and incident coordination. |

No broader pilot should start until the owner list is filled and shared with operators.

## Daily Operating Checklist

Start of day:

- Verify `/health/live`.
- Verify `/health/ready`.
- Confirm API and worker containers are healthy.
- Confirm Postgres and Redis containers are healthy.
- Record current API/worker image tags.
- Confirm no unexpected `PENDING` or `FAILED` ERPNext outbox rows.
- Review `DEAD_LETTER` rows and classify them as historical or active.
- Review credential hygiene warnings.
- Confirm pilot users are active, scoped, and have rotated temporary passwords.
- Confirm today's backup plan and rollback image tag.

During operations:

- Review ERPNext outbox after each operational batch.
- Confirm failed sync logs are visible and retryable when appropriate.
- Confirm cash payments attach to the correct collector cashbox.
- Spot-check branch scope and department scope with real users.
- Keep order volume within the approved daily limit.
- Record incident IDs, correlation IDs, and affected order/payment/cashbox/outbox IDs.

End of day:

- Confirm all cashboxes are submitted, reviewed, and approved or explicitly documented.
- Run payment reconciliation.
- Run financial close when rules allow.
- Verify orders status, payments summary, cashbox daily, ERPNext failures, and accounting close-day reports.
- Review recent API/worker logs for secret leakage patterns.
- Record all incidents and go/no-go recommendation for the next day.
- Confirm backup creation or scheduled backup health.

## Stop-Test Conditions

Pause broader pilot immediately if any condition occurs:

- `/health/ready` fails for more than 5 minutes.
- Worker is unhealthy or due outbox rows are not processing.
- Any payment is collected but missing from Awamir payment/cashbox records.
- Cashbox difference cannot be explained and approved by cashier/accounting leads.
- ERPNext sync creates wrong customer, item, warehouse, account, amount, or document relationship.
- A user can view or mutate data outside assigned branch, department, or driver scope.
- Logs, API responses, screenshots, or reports expose tokens, passwords, JWT secrets, ERPNext credentials, or password hashes.
- Backup cannot be created before a planned migration or destructive-risk operation.
- Any P0/P1 incident is open without a documented workaround and owner.

P2 incidents may continue only with explicit operations/accounting approval and a written workaround.

## Production Launch Gates

These gates are required before unrestricted production launch. They are not optional for public production.

### Credential And Auth Gates

- Rotate or disable all demo/staging credentials.
- Verify `GET /admin/security/credential-hygiene` has no unresolved production-blocking warnings.
- Confirm every real user has a named account and strong password.
- Confirm shared accounts are not used for real operations.
- Rehearse `AUTH_JWT_SECRET` rotation in a maintenance window.
- Document current access-token TTL and refresh-token TTL.
- Confirm password change, logout, logout-all, and session revocation work.

### Server And Network Gates

- Enable key-only SSH for named operators.
- Disable password SSH login.
- Restrict or remove direct root login where practical.
- Confirm firewall allows only approved public ports.
- Confirm API is behind TLS reverse proxy or private load balancer.
- Confirm API port `3000` is not publicly reachable unless firewalled.
- Confirm Postgres and Redis have no public host port exposure.
- Restrict Docker access to deployment operators.

### Backup And Rollback Gates

- Take a production-like Postgres backup.
- Restore that backup into staging or a restore rehearsal environment.
- Verify backup checksum before and after transfer.
- Rehearse GHCR image rollback using previous API/worker tags.
- Confirm application rollback does not require DB reset.
- Document that DB rollback requires explicit approval and reviewed SQL/restore plan.

### ERPNext Gates

- Rehearse ERPNext credential rotation with backend env-only update.
- Run backend ERPNext validate-connection after rotation.
- Verify ERPNext API key/secret never appears in Flutter, API responses, or logs.
- Confirm required customer, items, warehouse, receivable account, income account, and payment accounts exist.
- Confirm Payment Entry, Sales Order, and Sales Invoice sync each produce correct staging documents.

### Operations Gates

- Assign support owners for operations, accounting, ERPNext, infrastructure, and release engineering.
- Confirm incident handling checklist is known by operators.
- Confirm dead-letter review policy is understood.
- Confirm daily close owner and backup owner.
- Confirm monitoring/log review cadence.

## Dead-Letter Review Policy

Do not delete dead-letter rows automatically.

For each dead-letter row:

1. Record operation, source type, source ID, retry count, last error, and correlation ID.
2. Identify whether it is historical drill evidence or active operational risk.
3. Confirm Awamir operational record state is safe.
4. If retry is appropriate, use the existing ERPNext retry boundary.
5. If manual remediation is required, create a reviewed task with rollback notes.
6. Record final decision in the field-test or incident artifact.

Historical drill dead letters may remain visible in reports as audit evidence.

## Next-Business-Day Close Drill

Day 1 rerun and Day 2 both ran on `2026-05-17`, which was already financially closed. The next launch gate is a fresh Riyadh business date close drill.

Goal:

- Verify close-day creates a new financial close record and captures fresh totals, rather than idempotently returning an existing close.

Checklist:

1. Confirm current Riyadh business date has no `FinancialDayClose` record.
2. Take a staging DB backup and checksum.
3. Verify `/health/live` and `/health/ready`.
4. Create a fresh order with two mapped pilot products.
5. Submit, approve, split, produce, batch, deliver, and collect cash payment.
6. Verify cashbox expected cash equals collected cash and difference is `0`.
7. Submit, review, and approve the cashbox.
8. Review and sync Sales Order, Sales Invoice, and Payment Entry.
9. Verify order reaches `ACCOUNTING_POSTED` and payment reaches `POSTED`.
10. Run payment reconciliation for the fresh business date.
11. Close financial day.
12. Verify the close record is newly created and totals match reconciliation.
13. Verify reports:
    - orders status
    - payments summary
    - cashbox daily
    - ERPNext failures
    - accounting close-day
14. Scan recent logs for secret leakage.
15. Record result in a new operations artifact.

Pass criteria:

- Financial close record is new for the business date.
- Pending cashboxes are `0`.
- Payment/cashbox totals are reconciled.
- ERPNext outbox has no new failed or dead-letter rows.
- No P0/P1/P2 incident occurs.

## Operational Checks And Dashboards

Use existing backend checks before adding new UI:

- Health: `/health/live`, `/health/ready`
- Outbox: admin ERPNext outbox and ERPNext failures report
- Cashbox: cashbox daily report and cashbox list endpoints
- Payments: payments summary report and reconciliation endpoint
- Credential hygiene: `GET /admin/security/credential-hygiene`
- Settings secret masking: `GET /admin/settings`
- Logs: API and worker Docker logs with secret redaction scan

Suggested review cadence:

- Start of day: health, worker, outbox, credential hygiene.
- After each operational batch: outbox, sync logs, payment/cashbox spot check.
- End of day: reconciliation, close-day, reports, incident summary, backup status.

## Go / No-Go Framework

Proceed broader pilot when all are true:

- Latest controlled drills have no P0/P1/P2 incidents.
- Support owners are assigned.
- Backup and app rollback are ready.
- Pilot users have strong unique credentials and least-privilege scopes.
- ERPNext staging/production master data is verified.
- Financial close owner confirms daily procedure.
- Historical dead letters are classified and not confused with active failures.

Pause and fix when any are true:

- Any P0/P1 incident is open.
- Any payment/cashbox discrepancy is unresolved.
- ERPNext creates incorrect financial documents.
- Scope or permission isolation fails.
- Health, worker, or outbox reliability is unstable.
- Secret leakage is detected.
- Backup or rollback cannot be executed.

## Recommendation

Proceed broader pilot with conservative controls.

Do not treat this as unrestricted production launch. The recommended next phase is controlled production preparation with:

- broader pilot limited to 20-40 orders/day,
- next-business-day close drill,
- demo credential retirement,
- SSH/firewall hardening,
- backup restore rehearsal,
- image rollback rehearsal,
- ERPNext and JWT credential rotation rehearsal.
