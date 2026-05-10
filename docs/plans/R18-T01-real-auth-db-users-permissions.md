# R18-T01 Real Auth And DB-Backed Users/Permissions

## Purpose / Big Picture

Replace MVP static login sessions with staging-suitable database-backed authentication. Users, roles, permissions, branch scope, department scope, and driver scope will be loaded from PostgreSQL. Flutter keeps the same session flow and continues to call only Awamir Plus Backend.

## Scope

Included:
- Prisma auth/RBAC schema for users, roles, permissions, role permissions, user roles, branch access, and department access.
- Secure password hashing with a bcrypt-compatible implementation.
- Real `POST /auth/login` backed by `users`.
- JWT access token returned to Flutter.
- Permission guard support for JWT-backed request context.
- Seeded demo/staging users as data, not hardcoded sessions.
- Flutter login parsing adjustments without business logic duplication.
- Auth tests for valid login, invalid password, inactive user, DB permissions, and DB scopes.

Excluded:
- Flutter ERPNext access.
- ERPNext dependencies in auth.
- New business workflow behavior.
- Full refresh token rotation unless it fits cleanly; otherwise it is documented as a follow-up.
- Rate limiting implementation; document as a follow-up if not implemented.

## Files Expected To Change

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/auth/*`
- `apps/api/src/observability/request-correlation.middleware.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/src/auth/permissions.guard.spec.ts`
- `apps/mobile/lib/src/core/auth/session.dart`
- `apps/mobile/lib/src/core/api/api_client.dart` if token/header behavior needs a tiny adjustment
- `apps/mobile/lib/src/features/login/login_screen.dart`
- Flutter widget tests if seeded credentials or response shape expectations change
- `docs/plans/R18-T01-real-auth-db-users-permissions.md`

## Data Model Changes

Add:
- `User`
  - `id`, `username`, `email`, `displayName`, `passwordHash`, `isActive`, `driverId`, timestamps, soft delete.
- `Role`
  - `id`, `code`, `nameAr`, `nameEn`, `isActive`, timestamps, soft delete.
- `Permission`
  - `id`, `code`, `description`, timestamps.
- `RolePermission`
  - unique `roleId + permissionId`.
- `UserRole`
  - unique `userId + roleId`.
- `UserBranchAccess`
  - unique `userId + branchId`.
- `UserDepartmentAccess`
  - unique `userId + departmentId`.

Indexes:
- `users(username)`, `users(email)`, `users(is_active)`
- role/user join indexes
- branch and department scope indexes

## API Changes

Routes:
- `POST /auth/login`

Response:
- `token`
- `user.actorId`
- `user.displayName`
- `user.branchId`
- `user.branchIds`
- `user.departmentIds`
- `user.driverId`
- `user.permissions`

Errors:
- `INVALID_LOGIN`
- `USER_INACTIVE`

No password hash is returned.

## State Transitions

No operational state transitions.

## Authorization

- Keep `@RequirePermissions` metadata.
- Request permissions are loaded from JWT/session context.
- For compatibility with existing e2e tests, existing `x-permissions` headers remain accepted when no valid bearer session is present.
- No direct role checks.
- Flutter uses returned permissions only for UI guards; backend remains authoritative.

## Idempotency

Seed upserts by stable codes/usernames.
Login is read-only and not idempotency-keyed.

## Audit Logs

No required audit log for login in R18. Failed login attempts are not persisted in this task.

## Tests

Backend:
- Seed creates all required demo/staging users.
- Login succeeds for seeded DB user.
- Invalid password fails.
- Inactive user fails.
- Permissions come from DB roles.
- Branch and department scopes come from DB.
- Password hash is never returned.
- Permissions guard accepts JWT-backed permissions and still supports legacy header tests.

Flutter:
- Login still parses session.
- Auth error handling still displays backend standardized error message with correlation ID.
- No ERPNext references.

## Acceptance Criteria

- [ ] Login succeeds with seeded DB user.
- [ ] Invalid password fails.
- [ ] Inactive user fails.
- [ ] Permissions come from DB roles.
- [ ] Branch/department scopes come from DB.
- [ ] Flutter login still works.
- [ ] Existing workflows still work.
- [ ] No hardcoded role checks.
- [ ] Existing tests pass.

## Progress

- [x] Step 1: Read AGENTS.md, PLANS.md, current auth shim, current schema, seed, and Flutter session flow.
- [x] Step 2: Add Prisma auth/RBAC models and seed users/roles/permissions/scopes.
- [x] Step 3: Implement password hashing, JWT issuing, DB-backed login, and request auth context.
- [x] Step 4: Update tests and Flutter session assumptions.
- [x] Step 5: Run format, Prisma generation/migration, lint, typecheck, tests, e2e, Flutter analyze/test, and boundary scans.

## Surprises & Discoveries

- Current `/auth/login` is an MVP static session map in `AuthService`.
- Current protected API tests still use `x-permissions` and actor/scope headers directly. R18 will preserve that as a compatibility harness while real JWT-backed auth becomes the staging path.
- The schema currently has no `User`, `Role`, or permission tables.
- JWT-backed requests must overwrite actor/scope/permission headers server-side so clients cannot spoof scope headers alongside a valid token.

## Decision Log

- Use JWT access tokens now; refresh token rotation is only included if it remains small and does not risk destabilizing workflows.
- Keep legacy permission headers as fallback to preserve existing tests and internal test harnesses during R18.
- Use seeded users as the only demo accounts; remove hardcoded static login users from `AuthService`.
- Refresh token rotation/logout is deferred to a follow-up because the access-token path covers staging auth without adding session persistence complexity in this task.

## Outcome

Implemented and verified. Static MVP login sessions were replaced with DB-backed users, roles, permissions, branch access, and department access. `/auth/login` now verifies a bcrypt hash, rejects inactive users, and returns a JWT access token plus user scopes and permissions. Request middleware propagates JWT claims into the existing actor/scope headers so current services remain stable, while `PermissionsGuard` uses bearer-token permissions first and only accepts legacy permission headers in tests or when explicitly enabled.

Verification completed:
- `dart format .`
- `flutter analyze`
- `flutter test`
- `pnpm format`
- `pnpm prisma:generate`
- `pnpm prisma:migrate:dev`
- `pnpm db:seed`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
