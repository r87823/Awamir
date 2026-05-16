-- Add R22/R23 permissions and role mappings without refreshing seed users or resetting data.

INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), permission_code, 'Allows ' || permission_code, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('reports.view_operations'),
    ('reports.view_financials'),
    ('reports.view_erpnext'),
    ('admin.users.view'),
    ('admin.users.manage'),
    ('admin.roles.view'),
    ('admin.roles.manage'),
    ('admin.settings.view'),
    ('admin.settings.manage'),
    ('admin.master_data.view'),
    ('admin.master_data.manage'),
    ('admin.erpnext.view'),
    ('admin.erpnext.retry'),
    ('admin.reports.view')
) AS new_permissions(permission_code)
ON CONFLICT ("code") DO NOTHING;

WITH role_permission_mapping(role_code, permission_code) AS (
  VALUES
    ('BRANCH_SUPERVISOR', 'reports.view_operations'),
    ('FULFILLMENT_COORDINATOR', 'reports.view_operations'),
    ('CASHIER', 'reports.view_financials'),
    ('ACCOUNTANT', 'reports.view_financials'),
    ('ACCOUNTANT', 'reports.view_erpnext'),
    ('PLATFORM_ADMIN', 'reports.view_operations'),
    ('PLATFORM_ADMIN', 'reports.view_financials'),
    ('PLATFORM_ADMIN', 'reports.view_erpnext'),
    ('PLATFORM_ADMIN', 'admin.users.view'),
    ('PLATFORM_ADMIN', 'admin.users.manage'),
    ('PLATFORM_ADMIN', 'admin.roles.view'),
    ('PLATFORM_ADMIN', 'admin.roles.manage'),
    ('PLATFORM_ADMIN', 'admin.settings.view'),
    ('PLATFORM_ADMIN', 'admin.settings.manage'),
    ('PLATFORM_ADMIN', 'admin.master_data.view'),
    ('PLATFORM_ADMIN', 'admin.master_data.manage'),
    ('PLATFORM_ADMIN', 'admin.erpnext.view'),
    ('PLATFORM_ADMIN', 'admin.erpnext.retry'),
    ('PLATFORM_ADMIN', 'admin.reports.view')
)
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid(), roles.id, permissions.id, CURRENT_TIMESTAMP
FROM role_permission_mapping
JOIN "roles" ON roles.code = role_permission_mapping.role_code
JOIN "permissions" ON permissions.code = role_permission_mapping.permission_code
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
