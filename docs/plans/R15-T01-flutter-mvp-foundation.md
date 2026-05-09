# R15-T01 Flutter MVP Foundation

## Purpose / Big Picture

Build the first Flutter MVP shell connected only to the Awamir Plus backend. Flutter stores a backend session securely, sends backend permission/scope headers, handles standardized API errors with correlation IDs, and provides minimal operational screens.

## Scope

Included: Flutter app shell, environment config, centralized Dio client, secure session storage, permission and route guards, Arabic-first UI primitives, MVP operational screens, minimal backend `/auth/login` session shim, and tests.

Excluded: ERPNext screens, ERPNext credentials in Flutter, offline mode, push notifications, local business state machines, and full authentication complexity.

## Files Expected To Change

- `apps/api/src/auth/*`
- `apps/api/src/app.module.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/mobile/lib/**`
- `apps/mobile/test/**`
- `apps/mobile/pubspec.yaml`

## Data Model Changes

None.

## API Changes

- `POST /auth/login`

The endpoint returns a minimal MVP backend session with token, actor/scope fields, and permissions. Existing backend guards remain authoritative.

## State Transitions

Flutter does not implement business state machines. It only calls backend action endpoints and displays backend statuses.

## Authorization

Flutter uses permissions returned by `/auth/login` to hide navigation/actions. Backend guards still enforce all protected APIs through permission headers.

## Idempotency

Flutter forwards idempotency keys where user actions create sensitive records, such as draft payments. Backend idempotency remains authoritative.

## Audit Logs

No new audit behavior is introduced by Flutter. Existing backend mutations keep their audit behavior.

## Tests

- Flutter app boot widget test.
- API error parsing test.
- PermissionGuard test.
- Route guard test.
- Orders list happy-path screen test.
- Backend auth e2e test.
- ERPNext reference scan for mobile.

## Acceptance Criteria

- [ ] Flutter app boots.
- [ ] Login/session works.
- [ ] Token/session stored securely.
- [ ] Permissions control navigation/actions.
- [ ] Orders list and create draft work.
- [ ] Approval, fulfillment, production, delivery, payments, cashbox, and accounting screens call backend endpoints.
- [ ] API errors display correlation ID.
- [ ] No ERPNext references exist in Flutter.
- [ ] Existing backend tests pass.

## Progress

- [x] Step 1: Plan approved.
- [x] Step 2: Backend MVP auth endpoint implemented.
- [x] Step 3: Flutter foundation implemented.
- [x] Step 4: MVP screens implemented.
- [x] Step 5: Tests and verification completed.

## Surprises & Discoveries

- Backend currently has permission-header authorization but no login/session endpoint.
- Notifications have a model/handlers but no list API endpoint, so notifications are omitted from R15 UI.

## Decision Log

- Use Riverpod, go_router, Dio, and flutter_secure_storage.
- Keep Flutter permission-aware but backend-authoritative.
- Keep all Dio usage inside the API layer.
- Use a lightweight MVP auth/session shim instead of full auth.

## Outcome

Implemented and verified. Flutter now has a backend-only MVP shell with secure session storage, centralized Dio API client, standardized error parsing with correlation IDs, permission and route guards, Arabic-first UI primitives, and minimal operational screens for orders, approval, fulfillment, production, delivery, payments, cashbox, and accounting. A lightweight `/auth/login` MVP backend session endpoint was added and covered by e2e tests.

No ERPNext references were found in `apps/mobile`. Dio usage is limited to the centralized API client.
