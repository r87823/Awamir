# Controlled Field Testing Runbook

This runbook prepares Awamir Plus for limited real-world field testing. It is for controlled operations only, not a public production launch.

Flutter must call only Awamir Plus Backend. ERPNext credentials stay backend-only. Do not reset staging data during field testing.

## Field-Test Scope

Recommended initial scope:

- One destination branch.
- One production center.
- Two production departments.
- One driver.
- One cashier.
- One accountant.
- One platform admin or release engineer on call.
- 10-20 real orders per day until two consecutive clean operating days pass.

Keep the pilot narrow. Add branches, departments, users, or order volume only after daily close, cashbox, delivery, and ERPNext sync are clean.

## Go Gates

Field testing may start only when all are true:

- Staging API and worker are healthy.
- ERPNext staging connection validates from the backend.
- Demo or weak credentials have been rotated, disabled, or explicitly accepted for staging-only use.
- Real users are created with least-privilege permissions and correct branch/department/driver scopes.
- At least one backup has been taken and its checksum recorded.
- Rollback image tag is known.
- Cashbox open/submit/review/approve procedure has an assigned owner.
- Incident escalation contact list is filled in for operations, accounting, ERPNext, and release engineering.

## No-Go / Stop-Test Conditions

Pause field testing immediately if any occur:

- API readiness fails for more than 5 minutes.
- Worker is unhealthy or ERPNext outbox rows are stuck without a known recovery path.
- Any payment is collected but not reflected in Awamir payment/cashbox records.
- Cashbox difference cannot be explained by the cashier and accountant.
- ERPNext sync creates wrong customer, item, account, warehouse, or amount.
- Unauthorized user can view or act outside assigned branch, department, or driver scope.
- Logs or responses expose password, token, JWT secret, or ERPNext credential material.
- Backup cannot be created before a planned change.

## Operator Onboarding

1. Retire demo credentials before real use:
   - Review `GET /admin/security/credential-hygiene`.
   - Rotate weak passwords.
   - Disable users that are not needed for the pilot.
2. Create real users through Admin APIs.
3. Assign roles/permissions by job function only.
4. Assign branch scope for branch users and supervisors.
5. Assign department scope for production operators.
6. Assign driver scope for delivery users.
7. Require password change on first login when possible.
8. Verify each user can log in and sees only expected screens/actions.
9. Record operator name, username, role, scope, and onboarding date in the field-test tracker.

## Live Order Smoke

Run this with real field-test users before accepting live orders:

1. Branch operator creates a draft order using pilot product data.
2. Branch operator submits for approval.
3. Branch supervisor approves.
4. Fulfillment coordinator splits work orders by department.
5. Production operators accept, start, and mark work orders ready.
6. Packing flow is completed if enabled.
7. Delivery batch is created for the destination branch.
8. Driver picks up, marks out for delivery, and delivers.
9. Branch or driver collects payment.
10. Cashbox expected cash updates.
11. Cashbox is submitted, reviewed, and approved.
12. Accountant reviews and enqueues Sales Order, Sales Invoice, and Payment Entry sync where applicable.
13. ERPNext references are stored in Awamir.
14. Reports show the order, payment, cashbox, and ERPNext sync state.
15. Admin audit trail shows sensitive mutations.

Keep the Awamir records as audit evidence. Do not clean up live field-test rows unless a staging refresh is explicitly approved.

## Daily Operating Checklist

Start of day:

- Check `/health/live` and `/health/ready`.
- Check API and worker container health.
- Check Redis and PostgreSQL container health.
- Review credential hygiene warnings.
- Confirm no unresolved `DEAD_LETTER` ERPNext outbox rows from the previous day.
- Confirm current rollback image tag.

During day:

- Review failed ERPNext sync logs after every operational batch.
- Confirm payments and cashbox entries are attached to the correct collector.
- Confirm branch and department scopes with spot checks.
- Monitor auth rate-limit and suspicious login failures.

End of day:

- Cashiers submit cashboxes.
- Cashier/accountant reviews and approves cashboxes.
- Accountant closes financial day when allowed.
- Record ERPNext sync failures and manual recovery decisions.
- Take or verify scheduled backup.
- Record field-test notes, incidents, and next-day scope changes.

## Backup And Rollback

Before any migration or destructive-risk operation:

```bash
cd /opt/awamir-plus-staging
mkdir -p backups
backup_file="backups/awamir-plus-staging-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
```

Application rollback:

```bash
cd /opt/awamir-plus-staging
# Restore previous AWAMIR_API_IMAGE and AWAMIR_WORKER_IMAGE in .env.staging.
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml pull api worker
docker compose --env-file .env.staging -f docker-compose.prod.yml -f docker-compose.staging.yml up -d --no-deps api worker
curl -fsS https://api-staging.r8787m.cc/health/ready
```

Do not restore a database backup without explicit approval and an incident note.

## Operational Limits

Known controlled-testing limits:

- No offline mode.
- No push notifications.
- No direct printer/device integration in backend scope.
- Payment Entry duplicate handling remains an ERPNext hardening follow-up.
- Public production still requires demo credential retirement, key-only SSH, firewall confirmation, and backup restore rehearsal.

## Escalation Placeholders

Fill these before field testing starts:

- Operations lead:
- Accounting lead:
- ERPNext owner:
- Release engineer:
- Infrastructure/on-call:
- Stop-test approver:
