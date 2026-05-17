# Operator Onboarding Checklist

Use this checklist to create field-test users with least privilege. Do not hardcode roles in application logic; assign permissions and scopes through the existing admin model.

## Shared Steps

- Create a named user; no shared accounts for real field testing.
- Use a temporary strong password and set `requirePasswordChange=true` when possible.
- Verify the user changes the password before field operations.
- Confirm `GET /admin/security/credential-hygiene` shows no weak/default password warning for the user after rotation.
- Confirm the user cannot access unrelated screens or records.
- Record username, person name, permission group, branch scope, department scope, driver scope, and activation date.

## Branch Operator

Purpose: create and submit branch orders.

Checklist:

- Assign branch order permissions.
- Assign only the operator's branch scope.
- Verify the operator can create a draft order.
- Verify the operator can submit only own/scoped draft orders.
- Verify the operator cannot approve orders.

## Branch Supervisor

Purpose: approve, reject, or return branch orders.

Checklist:

- Assign approval permissions.
- Assign only supervised branch scopes.
- Verify approval queue shows only scoped branch orders.
- Verify rejection and return require reason/notes.
- Verify supervisor cannot view another branch order.

## Fulfillment Coordinator

Purpose: split approved orders into department work orders.

Checklist:

- Assign fulfillment queue and split permissions.
- Verify approved orders appear in fulfillment queue.
- Verify missing item-department mapping blocks split.
- Verify repeated split returns existing work orders without duplicates.

## Production Operator

Purpose: process department work orders.

Checklist:

- Assign production operator permissions.
- Assign only allowed department scopes.
- Verify queue shows only assigned departments.
- Verify accept, in-production, delayed, ready, and reject transitions.
- Verify delay/reject reason is required.

## Driver

Purpose: deliver assigned batches.

Checklist:

- Assign delivery driver permissions.
- Link user to the correct driver identity.
- Verify assigned batches endpoint shows only the driver's batches.
- Verify pickup, out-for-delivery, delivered, and returned actions.
- Verify returned orders require standardized reason.

## Cashier

Purpose: review and approve cashboxes.

Checklist:

- Assign cashbox view/review/approve/return permissions.
- Verify submitted cashboxes are visible.
- Verify returned cashbox requires reason.
- Verify approved cashbox cannot be modified.
- Verify close-day rules are understood.

## Accountant

Purpose: review and submit financial documents to ERPNext.

Checklist:

- Assign accounting financial permissions.
- Assign ERPNext sync log visibility and retry permissions if needed.
- Verify accounting dashboard loads.
- Verify sales order, invoice, and payment review actions.
- Verify sync enqueue uses outbox and never blocks operational workflow.
- Verify failed sync is visible and retryable.

## Platform Admin

Purpose: manage users, permissions, settings, reports, and operational support.

Checklist:

- Keep platform admin count minimal.
- Use strong unique credentials.
- Enable password rotation for any admin created for the pilot.
- Verify settings mask ERPNext secrets.
- Verify user lists never expose password hashes.
- Verify admin mutations create audit records.

## Test Account Retirement

After onboarding:

- Disable throwaway smoke users.
- Rotate any temporary password used in a shared setting.
- Keep audit history intact.
- Do not delete production-critical seed/master data.
