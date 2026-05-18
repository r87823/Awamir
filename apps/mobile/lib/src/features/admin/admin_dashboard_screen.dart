import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/permission_guard.dart';
import '../../core/ui/awamir_scaffold.dart';

class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AwamirScaffold(
      title: 'الإدارة',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          PermissionGuard(
            permissions: const ['admin.users.view'],
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.people),
                title: const Text('المستخدمون'),
                subtitle: const Text('إضافة وتعديل المستخدمين والصلاحيات'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => context.go('/admin/users'),
              ),
            ),
          ),
          PermissionGuard(
            permissions: const ['admin.reports.view'],
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.analytics),
                title: const Text('التقارير'),
                subtitle: const Text('تقارير التشغيل والماليات والتكامل'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => context.go('/reports'),
              ),
            ),
          ),
          PermissionGuard(
            permissions: const [
              'admin.erpnext.view',
              'admin.erpnext.products_sync',
            ],
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.sync),
                title: const Text('مزامنة منتجات ERPNext'),
                subtitle: const Text('استيراد الأصناف إلى منتجات Awamir'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => context.go('/admin/erpnext-products'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
