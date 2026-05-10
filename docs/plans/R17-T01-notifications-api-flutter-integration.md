# R17-T01 Notifications API And Flutter Integration

## Purpose / Big Picture

Expose existing notification infrastructure to Flutter through protected backend APIs and integrate it into the Flutter MVP shell with list, unread count, read actions, and lightweight entity navigation.

## Scope

Included: backend notification list/count/read APIs, pagination/filtering, actor scope enforcement, idempotent read operations, backend tests, Flutter repository methods, notifications screen, unread dashboard badge, and Flutter tests.

Excluded: push notifications, websocket/live polling, notification preferences, ERPNext dependencies, direct DB access from Flutter, and local workflow/business logic duplication.

## Files Expected To Change

- `apps/api/src/notifications/*`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/test/notifications.e2e-spec.ts`
- `apps/mobile/lib/src/core/api/backend_repository.dart`
- `apps/mobile/lib/src/core/routing/app_router.dart`
- `apps/mobile/lib/src/features/dashboard/dashboard_screen.dart`
- `apps/mobile/lib/src/features/notifications/*`
- `apps/mobile/test/widget_test.dart`

## Data Model Changes

No schema changes planned. Existing `Notification` model is reused.

## API Changes

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

Permissions:

- `notifications:view`
- `notifications:read`

## State Transitions

Notification read state only:

- unread -> read
- read -> read is idempotent

## Authorization

No role checks. Endpoints use permission metadata and actor scope. A user can see notifications addressed to their actor id, their driver id, or broadcast notifications with no recipient.

## Idempotency

Read operations are idempotent. Re-reading one notification returns it unchanged. Reading all when there are no unread notifications returns `updatedCount: 0`.

## Audit Logs

No audit logs are planned for read receipts because they are user-consumption metadata, not operational workflow mutations.

## Tests

- List notifications with scope.
- Unread filter.
- Type filter.
- Unread count.
- Mark read.
- Mark read idempotency.
- Mark all.
- Out-of-scope read returns not found.
- Flutter notification list/badge/read actions.
- ERPNext boundary scans.

## Acceptance Criteria

- [ ] User can list notifications.
- [ ] User can filter unread notifications.
- [ ] Unread count updates correctly.
- [ ] Mark read works.
- [ ] Mark all works.
- [ ] Flutter badge updates correctly.
- [ ] Existing tests pass.
- [ ] No ERPNext dependencies are introduced.

## Progress

- [x] Step 1: Plan approved.
- [x] Step 2: Backend API implemented.
- [x] Step 3: Backend tests implemented.
- [x] Step 4: Flutter integration implemented.
- [x] Step 5: Flutter tests implemented.
- [x] Step 6: Verification completed.

## Surprises & Discoveries

- Existing notifications are mostly broadcast because `recipient` is currently nullable and not set by handlers.
- API typecheck was blocked by `ignoreDeprecations: "6.0"` and `rootDir: "."`; both were corrected to restore the existing repo typecheck behavior.

## Decision Log

- Treat `recipient = null` as broadcast.
- Add explicit notification permissions.
- Keep Flutter polling/manual refresh only.

## Outcome

Implemented and verified. Backend now exposes protected notification list, unread count, mark-read, and read-all endpoints with pagination, filters, scope enforcement, and idempotent reads. Flutter now has a notifications route/screen, dashboard unread badge, repository methods through the centralized API client, mark-read/read-all actions, and order navigation when notification entity metadata points to an order.

No Prisma schema changes were made. No ERPNext references were introduced in Flutter or the notifications backend. Dio usage remains centralized in `apps/mobile/lib/src/core/api/api_client.dart`.
