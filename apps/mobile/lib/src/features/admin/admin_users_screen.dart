import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/simple_list.dart';

class AdminUsersScreen extends ConsumerWidget {
  const AdminUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'المستخدمون',
      floatingActionButton: PermissionGuard(
        permissions: const ['admin.users.manage'],
        child: FloatingActionButton(
          onPressed: () => context.go('/admin/users/new'),
          child: const Icon(Icons.person_add),
        ),
      ),
      body: AsyncStateView(
        future: repo.adminUsers(),
        builder: (context, page) => SimpleList(
          items: page.data,
          titleFor: (user) =>
              '${user['displayName'] ?? user['username'] ?? user['id']}',
          subtitleFor: (user) =>
              '${user['username'] ?? ''} · ${_roleText(user)} · ${_branchText(user)} · ${_activeText(user)}',
          onTap: (user) => context.go('/admin/users/${user['id']}'),
        ),
      ),
    );
  }
}

String _activeText(Map<String, Object?> user) =>
    user['isActive'] == false ? 'معطل' : 'نشط';

String _roleText(Map<String, Object?> user) {
  final roles = user['roles'];
  if (roles is! List || roles.isEmpty) return 'بدون دور';
  return roles
      .whereType<Map>()
      .map((role) => role['code'] ?? role['nameEn'] ?? role['nameAr'])
      .whereType<Object>()
      .join(', ');
}

String _branchText(Map<String, Object?> user) {
  final branches = user['branches'];
  if (branches is! List || branches.isEmpty) return 'بدون فرع';
  return branches
      .whereType<Map>()
      .map((branch) => branch['code'] ?? branch['nameAr'] ?? branch['nameEn'])
      .whereType<Object>()
      .join(', ');
}
